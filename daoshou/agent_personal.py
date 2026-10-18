"""Ask Atlas over statements a user uploaded.

Same rule as v2: code does the math, the model orchestrates and explains. On top of that, the
model only ever sees totals. The tools return per-platform and per-month aggregates, the tax
layer and the forms check; never a record, a date of payment, an order or contract id, an
account name or a client. The browser already replaces account names with its own labels before
uploading; on top of that, accounts reach the model only as "acct-NNNN" codes drawn from a salt
made fresh for each request, so not even the browser's labels get through. The question the
user types is the one thing that reaches the model as they wrote it.

Manual income and expenses come back totalled by the person's own source label or by category;
an expense's own label and any notes never reach the model (notes never reach the server).

Runs are traced to PRISM content-free (see prism_tracing.py).
"""
from __future__ import annotations

import hashlib
import secrets
from decimal import Decimal

from . import bookkeeping, ledger, rewards, tax_home
from .prism_tracing import ToolError

SYSTEM = """You are Atlas, the assistant in Side Atlas. You answer questions about one person's \
side income, using statements they uploaded from platforms such as Upwork, Fiverr, Freelancer.com, \
Contra, YouTube, Twitch, Patreon and Bilibili (shown as B站).

Every number you give must come straight from a tool output. Never do arithmetic yourself, never \
estimate, and never substitute or interpolate an exchange rate.

The tools only return totals. If a question needs a single payment, order or client, say that the \
Ledger page lists every record; don't guess.

Start with get_summary to see which platforms, months and settings there are. Then:
- a month's income, fees, tax withheld, net or the best platform: compute_breakdown;
- change between two months: compare_months;
- tax over a month or a period ('2025-09', '2025-Q3' or '2025-07~2025-09'): tax_items (tax withheld, \
the set-aside at the user's own rate, deadlines for their tax home, items for an accountant);
- US tax forms vs what landed (1099-K threshold, possible duplicate reports): form_check. It only \
applies when the tax home includes the US;
- income the user entered by hand (tutoring, a commission): get_manual_income;
- expenses they entered, and what they kept after expenses: get_expenses. Platform fees are already \
taken out of platform net, so they are not expenses;
- their monthly income goal: get_goal_progress.

If any tool reports missing data (for example MissingFXRate), do not work around it: call \
submit_answer with answer null and say exactly what is missing.

Call submit_answer exactly once with the figure exactly as a tool reported it, in the currency the \
tools use. Then reply briefly in the user's language. Tax figures are estimates, not tax advice."""

_month = {"month": {"type": "string", "description": "YYYY-MM"}}
_period = {"period": {"type": "string", "description": "'YYYY-MM', 'YYYY-Qn' or 'YYYY-MM~YYYY-MM'"}}

TOOLS = [
    {"type": "function", "function": {
        "name": "get_summary",
        "description": "Platforms (with how many accounts), months covered, the display currency, tax home, "
                       "set-aside rate and any months with records that can't be converted yet.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "compute_breakdown",
        "description": "One month: per-platform and total gross, platform fees, payout fees, tax withheld and "
                       "net, net rates, and the platform with the highest net rate. Fails if a rate is missing.",
        "parameters": {"type": "object", "properties": {**_month}, "required": ["month"]}}},
    {"type": "function", "function": {
        "name": "compare_months",
        "description": "Change in total net from earlier_month to later_month (later minus earlier).",
        "parameters": {"type": "object", "properties": {
            "later_month": {"type": "string"}, "earlier_month": {"type": "string"}},
            "required": ["later_month", "earlier_month"]}}},
    {"type": "function", "function": {
        "name": "tax_items",
        "description": "Tax layer for a month or period: tax withheld by platform and country, total net, the "
                       "set-aside at the user's own rate, deadlines for each country in their tax home after "
                       "after_date (default: today), and items to raise with an accountant. Informational only.",
        "parameters": {"type": "object", "properties": {
            **_period, "after_date": {"type": "string", "description": "YYYY-MM-DD (optional)"}},
            "required": ["period"]}}},
    {"type": "function", "function": {
        "name": "form_check",
        "description": "US tax forms vs what landed for a month or period: per platform the form a US person would "
                       "typically get (simulated), the form-view gross, what landed, the gap, payout method, a "
                       "possible-duplicate-report flag and the calendar-year 1099-K threshold status. In USD.",
        "parameters": {"type": "object", "properties": {**_period}, "required": ["period"]}}},
    {"type": "function", "function": {
        "name": "get_manual_income",
        "description": "Income the user entered by hand (not from a statement) for a month or period: totals by "
                       "their own source labels, number of entries and the total. Fails if a rate is missing.",
        "parameters": {"type": "object", "properties": {**_period}, "required": ["period"]}}},
    {"type": "function", "function": {
        "name": "get_expenses",
        "description": "Expenses the user entered for a month or period: totals by category, number of entries, the "
                       "total, and what they kept after expenses (platform net + manual income - expenses). "
                       "Fails if a rate is missing.",
        "parameters": {"type": "object", "properties": {**_period}, "required": ["period"]}}},
    {"type": "function", "function": {
        "name": "get_goal_progress",
        "description": "Progress toward the user's monthly income goal for each month of a period: income "
                       "(platform net + manual income, before expenses), progress, remaining and whether it was "
                       "reached. Says so when no goal is set.",
        "parameters": {"type": "object", "properties": {**_period}, "required": ["period"]}}},
    {"type": "function", "function": {
        "name": "submit_answer",
        "description": "Record the final answer. Call exactly once.",
        "parameters": {"type": "object", "properties": {
            "answer": {"type": ["number", "string", "null"]},
            "unit": {"type": "string", "description": "USD, CNY, platform, date or count"},
            "explanation": {"type": "string"}}, "required": ["answer", "unit"]}}},
]


def _missing(e: ledger.MissingFXRate) -> ToolError:
    return ToolError(f"MissingFXRate: no {e.currency}/USD rate for {', '.join(e.dates)}; those records cannot be "
                     f"converted and no rate may be estimated")


def pseudonyms(accounts: dict[str, list[str]], salt: bytes) -> dict[tuple[str, str], str]:
    """(platform, account) -> "acct-NNNN", 4 digits from a salted hash; a clash takes the next free code."""
    out, used = {}, set()
    for platform, names in accounts.items():
        for name in names:
            n = int(hashlib.sha256(salt + f"{platform}\0{name}".encode()).hexdigest(), 16) % 10_000
            while n in used:
                n = (n + 1) % 10_000
            used.add(n)
            out[(platform, name)] = f"acct-{n:04d}"
    return out


def make_tools(creator: dict, *, currency: str, home: str, today: str, state: dict) -> dict:
    """Tools bound to one request's upload. `creator` is statements.profile(...)."""
    sfx = currency.lower()
    cents = ledger.cents
    codes = pseudonyms(creator["account_list"], secrets.token_bytes(16))
    entries = bookkeeping.entries_of(creator)

    def months_of(period: str) -> list[str]:
        try:
            months = ledger.months_in(period)
        except (ValueError, IndexError):
            raise ToolError(f"period must be YYYY-MM, YYYY-Qn or YYYY-MM~YYYY-MM, got {period!r}") from None
        for m in months:
            if len(m) != 7 or m[4] != "-":
                raise ToolError(f"month must be YYYY-MM, got {m!r}")
        return months

    def totals(month: str) -> dict:
        """Per-platform sums in the display currency; raises on a missing rate."""
        per: dict[str, dict[str, Decimal]] = {}
        for p in ledger.PLATFORMS:
            for rec in ledger.records(creator, p, month):
                try:
                    vals = ledger.convert(rec, currency)
                except ledger.MissingFXRate as e:
                    raise _missing(e) from None
                t = per.setdefault(p, {f: Decimal(0) for f in ledger.FIELDS})
                for f, v in vals.items():
                    t[f] += v
        total = {f: sum((t[f] for t in per.values()), Decimal(0)) for f in ledger.FIELDS}
        return {"per": per, "total": total}

    def money(values: dict) -> dict:
        return {f"{k}_{sfx}": cents(v) for k, v in values.items()}

    def entry_totals(months: list[str], kind: str) -> tuple[dict[str, list], Decimal]:
        """label -> [amount, entries] for income (by source) or expenses (by category)."""
        groups: dict[str, list] = {}
        total = Decimal(0)
        for e in entries:
            if e.kind != kind or e.record.month not in months:
                continue
            try:
                amount = ledger.convert(e.record, currency)["net"]
            except ledger.MissingFXRate as err:
                raise _missing(err) from None
            g = groups.setdefault(e.label, [Decimal(0), 0])
            g[0] += amount
            g[1] += 1
            total += amount
        return groups, total

    def get_summary() -> dict:
        issues = []
        for m in creator["active_months"]:
            n = 0
            for p in ledger.PLATFORMS:
                for rec in ledger.records(creator, p, m):
                    try:
                        ledger.convert(rec, currency)
                    except ledger.MissingFXRate:
                        n += 1
            if n:
                issues.append({"month": m, "records_without_a_rate": n})
        return {"currency": currency, "tax_home": home, "set_aside_rate": creator["set_aside_rate"],
                "months": creator["active_months"],
                "platforms": [{"platform": ledger.LABEL[p], "accounts": [codes[(p, a)] for a in accts]}
                              for p, accts in creator["account_list"].items()],
                "months_with_missing_rates": issues,
                "manual_income_sources": sorted({e.source for e in entries if e.kind == "income"}),
                "expense_categories": sorted({e.category for e in entries if e.kind == "expense"}),
                "manual_entries": {"income": sum(e.kind == "income" for e in entries),
                                   "expenses": sum(e.kind == "expense" for e in entries)},
                "monthly_goal": ({"amount": float(goal["amount"]), "currency": goal["currency"]}
                                 if (goal := bookkeeping.goal_of(creator)) else None)}

    def compute_breakdown(month: str) -> dict:
        b = totals(months_of(month)[0])
        platforms, best, best_rate = {}, None, None
        for p, t in b["per"].items():
            row = money(t)
            if t["gross"]:
                rate = t["net"] / t["gross"]
                row["net_rate"] = float(round(rate, 4))
                if best_rate is None or rate > best_rate:
                    best, best_rate = p, rate
            platforms[ledger.LABEL[p]] = row
        out = {"month": month, "currency": currency, "platforms": platforms, "total": money(b["total"]),
               "best_platform_by_net_rate": ledger.LABEL[best] if best else None}
        if not platforms:
            out["note"] = "no income records this month"
        return out

    def compare_months(later_month: str, earlier_month: str) -> dict:
        later = totals(months_of(later_month)[0])["total"]["net"]
        earlier = totals(months_of(earlier_month)[0])["total"]["net"]
        return {"currency": currency, "later_month": later_month, f"later_net_{sfx}": cents(later),
                "earlier_month": earlier_month, f"earlier_net_{sfx}": cents(earlier),
                f"change_{sfx}": cents(later - earlier)}

    def tax_items(period: str, after_date: str | None = None) -> dict:
        months = months_of(period)
        net, withheld, seen, cny_income = Decimal(0), {}, set(), False
        for m in months:
            b = totals(m)
            net += b["total"]["net"]
            seen |= {ledger.LABEL[p] for p in b["per"]}
            for p, t in b["per"].items():
                if t["withheld"]:
                    withheld[p] = withheld.get(p, Decimal(0)) + t["withheld"]
            cny_income |= any(r.currency == "CNY" for p in b["per"] for r in ledger.records(creator, p, m))
        rows = []
        for p, amount in withheld.items():
            country, kind = ledger.WITHHOLDING.get(p, ("unknown", "tax withheld by the platform"))
            native = sum((r.withheld for m in months for r in ledger.records(creator, p, m) if r.currency == "CNY"),
                         Decimal(0))
            rows.append({"platform": ledger.LABEL[p], "country": country, "tax": kind, "amount": cents(amount),
                         "amount_cny": cents(native) if native else None})
        rate = ledger.D(creator["set_aside_rate"])
        sections = tax_home.sections(tax_home=home, months=months, after=after_date or today, withheld=rows,
                                     platforms_seen=sorted(seen), currency=currency, has_cny_income=cny_income)
        return {"period": period, "months": months, "currency": currency, "tax_home": home,
                "tax_withheld_by_platform": rows, f"total_net_{sfx}": cents(net),
                "set_aside_rate": float(rate), f"set_aside_{sfx}": cents(net * rate),
                "by_country": sections, "note": "Estimate only, not tax advice."}

    def form_check(period: str) -> dict:
        if "US" not in tax_home.HOMES[home]:
            return {"applies": False, "note": "US tax forms only apply when the tax home includes the US."}
        try:
            out = ledger.form_check(creator, months_of(period))
        except ledger.MissingFXRate as e:
            raise _missing(e) from None
        return {"period": period, "currency": "USD", **out}

    def get_manual_income(period: str) -> dict:
        groups, total = entry_totals(months_of(period), "income")
        return {"period": period, "currency": currency,
                "by_source": [{"source": label, f"income_{sfx}": cents(v), "entries": n}
                              for label, (v, n) in sorted(groups.items(), key=lambda kv: -kv[1][0])],
                f"total_{sfx}": cents(total), "entries": sum(n for _, n in groups.values())}

    def get_expenses(period: str) -> dict:
        months = months_of(period)
        groups, total = entry_totals(months, "expense")
        _, manual = entry_totals(months, "income")
        net = sum((totals(m)["total"]["net"] for m in months), Decimal(0))
        return {"period": period, "currency": currency,
                "by_category": [{"category": label, f"amount_{sfx}": cents(v), "entries": n}
                                for label, (v, n) in sorted(groups.items(), key=lambda kv: -kv[1][0])],
                f"total_{sfx}": cents(total), "entries": sum(n for _, n in groups.values()),
                "kept_after_expenses": {f"platform_net_{sfx}": cents(net), f"manual_income_{sfx}": cents(manual),
                                        f"expenses_{sfx}": cents(total), f"kept_{sfx}": cents(net + manual - total)},
                "note": "Platform fees are already taken out of platform net; expenses are only what the user "
                        "entered."}

    def get_goal_progress(period: str) -> dict:
        goal = bookkeeping.goal_of(creator)
        if not goal:
            return {"goal": None, "note": "No monthly goal is set."}
        g = rewards.goal_progress(bookkeeping.events(creator), months_of(period), goal["amount"], goal["currency"])
        return {"amount": g["amount"], "currency": g["currency"], "basis": g["basis"],
                "months": [{k: v for k, v in m.items() if k != "reached_on"} for m in g["months"]],
                "months_reached": g["months_reached"]}

    def submit_answer(answer=None, unit: str = "", explanation: str = "") -> dict:
        state["submitted"] = {"answer": answer, "unit": unit, "explanation": explanation}
        return {"status": "recorded"}

    return {f.__name__: f for f in (get_summary, compute_breakdown, compare_months, tax_items, form_check,
                                    get_manual_income, get_expenses, get_goal_progress, submit_answer)}

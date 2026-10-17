"""v2: code does the math, the model only orchestrates and explains.

Follows the requirements doc's flow: read each platform, convert non-USD records
at each record's own date, break down deductions, then the tax layer (set-aside,
tax already withheld, next US estimated-tax date), and the model answers using
only those numbers. A missing exchange rate raises instead of being estimated,
which marks the run failed in PRISM and fires the alert.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from . import data, ledger
from .prism_tracing import ToolError

SYSTEM = """You are Daoshou (到手), a ledger for people who earn side income on global platforms \
(Upwork, Fiverr, Freelancer.com, Contra, YouTube, Twitch, Patreon, Bilibili), with a tax layer that \
sorts out the tax items they will probably need.

Every number you give must come straight from a tool output. Never do arithmetic yourself, never \
estimate, and never substitute or interpolate an exchange rate.

Flow for a monthly question:
1. find_creator.
2. load_platform for each platform the creator has an account on (or only the platform asked about).
3. convert_currency for the month (converts non-USD records at each record's own date).
4. compute_breakdown for the month: per-platform and total gross, platform fees, payout fees, \
withheld tax and net in USD, native CNY figures, Fiverr tip fees, and net rates.
5. If needed: compute_set_aside, simulate_patreon_ios, or compare_months.
Fee details for one platform, a Fiverr month's tips, a Freelancer.com project or an Upwork \
contract: get_fee_details or get_upwork_contract_fees.
Tax questions over a month or a period (tax already withheld and by whom, a quarter's set-aside, \
the next US estimated-tax due date, items to raise with an accountant): tax_items. It loads, \
converts and breaks down every month itself, so call it right after find_creator.

If any tool reports missing data (for example MissingFXRate), do not work around it: call \
submit_answer with answer null and say exactly what is missing.

Call submit_answer exactly once with the figure exactly as a tool reported it (USD unless the \
question asks for CNY; a platform name for "which platform" questions; YYYY-MM-DD for dates). \
Then reply with a short explanation in the user's language. Tax figures are estimates, not tax advice."""

_creator = {"creator_id": {"type": "string"}}
_month = {"month": {"type": "string", "description": "YYYY-MM"}}

TOOLS = [
    {"type": "function", "function": {
        "name": "find_creator",
        "description": "Look up a creator by name or id. Returns their platform accounts and settings.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "load_platform",
        "description": "Parse one platform's export for a creator and month into ledger records (native currency).",
        "parameters": {"type": "object", "properties": {
            **_creator, "platform": {"type": "string", "enum": ledger.PLATFORMS}, **_month},
            "required": ["creator_id", "platform", "month"]}}},
    {"type": "function", "function": {
        "name": "convert_currency",
        "description": "Convert the creator's non-USD records (CNY, EUR, GBP) for the month to USD at each "
                       "record's own date. Fails if a rate is missing.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "compute_breakdown",
        "description": "Per-platform and total breakdown in USD (gross, platform fee, payout fee, withheld tax, "
                       "net, net rate), native CNY figures, Fiverr tip fees, and the platform with the highest "
                       "net rate.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "compute_set_aside",
        "description": "Tax set-aside for one month: total net USD x the creator's own set_aside_rate.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "simulate_patreon_ios",
        "description": "How much less Patreon would pay if Apple took its simulated extra cut of iOS pledges.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "compare_months",
        "description": "Change in total net USD from earlier_month to later_month (later minus earlier).",
        "parameters": {"type": "object", "properties": {
            **_creator, "later_month": {"type": "string"}, "earlier_month": {"type": "string"}},
            "required": ["creator_id", "later_month", "earlier_month"]}}},
    {"type": "function", "function": {
        "name": "get_fee_details",
        "description": "Fee charged on each record of one platform, with subtotals by record type (e.g. Fiverr "
                       "Order / Extra / Tip). Filter by month and/or ref (Fiverr order id, Freelancer.com "
                       "project id). Amounts in the record's own currency, plus USD where convertible.",
        "parameters": {"type": "object", "properties": {
            **_creator, "platform": {"type": "string", "enum": ledger.PLATFORMS},
            "month": {"type": "string", "description": "YYYY-MM (optional)"},
            "ref": {"type": "string", "description": "order or project id (optional)"}},
            "required": ["creator_id", "platform"]}}},
    {"type": "function", "function": {
        "name": "get_upwork_contract_fees",
        "description": "Upwork service fees charged on one contract across all months, fee per payment and total.",
        "parameters": {"type": "object", "properties": {**_creator, "contract_id": {"type": "string"}},
                       "required": ["creator_id", "contract_id"]}}},
    {"type": "function", "function": {
        "name": "tax_items",
        "description": "Tax layer for a month or period ('2026-09', '2026-Q3' or '2026-07~2026-09'): tax already "
                       "withheld by platform and country, total net, set-aside at the creator's own rate, the next "
                       "US estimated-tax due date after after_date (default: the period's last day), and items to "
                       "raise with an accountant. Informational only.",
        "parameters": {"type": "object", "properties": {
            **_creator, "period": {"type": "string"},
            "after_date": {"type": "string", "description": "YYYY-MM-DD (optional)"}},
            "required": ["creator_id", "period"]}}},
    {"type": "function", "function": {
        "name": "submit_answer",
        "description": "Record the final answer. Call exactly once.",
        "parameters": {"type": "object", "properties": {
            "answer": {"type": ["number", "string", "null"]},
            "unit": {"type": "string", "description": "USD, CNY, platform or date"},
            "explanation": {"type": "string"}}, "required": ["answer", "unit"]}}},
]

DISCLAIMER = "Estimate only — not tax, legal, or financial advice."


def _money(values: dict[str, Decimal]) -> dict[str, float]:
    return {k: ledger.cents(v) for k, v in values.items()}


def _missing_fx(e: ledger.MissingFXRate) -> ToolError:
    return ToolError(f"MissingFXRate: no {e.currency}/USD rate for {', '.join(e.dates)}; {e.currency} records on "
                     f"that date cannot be converted and no rate may be estimated")


def make_tools(state: dict) -> dict:
    def creator(creator_id: str) -> dict:
        c = data.find_creator(creator_id)
        if c is None:
            raise ToolError(f"no creator {creator_id!r}")
        return c

    def check_month(month: str) -> str:
        if len(month) != 7 or month[4] != "-":
            raise ToolError(f"month must be YYYY-MM, got {month!r}")
        return month

    def platform(name: str) -> str:
        try:
            return ledger.platform_key(name)
        except ValueError as e:
            raise ToolError(str(e)) from None

    def breakdown(creator_id: str, month: str) -> dict:
        try:
            return ledger.month_breakdown(creator(creator_id), check_month(month))
        except ledger.MissingFXRate as e:
            raise _missing_fx(e) from None

    def find_creator(name: str) -> dict:
        c = data.find_creator(name)
        if c is None:
            raise ToolError(f"no creator named {name!r}")
        return {k: c[k] for k in ("creator_id", "name", "tax_country", "set_aside_rate", "accounts")}

    def load_platform(creator_id: str, platform_name: str, month: str) -> dict:
        key = platform(platform_name)
        recs = ledger.records(creator(creator_id), key, check_month(month))
        if not recs:
            return {"platform": key, "month": month, "records": 0, "note": "no records this month"}
        return {"platform": key, "month": month, "records": len(recs),
                "currencies": sorted({r.currency for r in recs}), "dates": [recs[0].date, recs[-1].date],
                "record_types": sorted({r.kind for r in recs}),
                "has_withheld_tax": any(r.withheld for r in recs)}

    def convert_currency(creator_id: str, month: str) -> dict:
        c = creator(creator_id)
        recs = [r for p in ledger.PLATFORMS for r in ledger.records(c, p, check_month(month)) if r.currency != "USD"]
        if not recs:
            return {"month": month, "non_usd_records": 0, "note": "no non-USD records this month"}
        missing = ledger.missing_rates(recs)
        if missing:
            cur, dates = next(iter(missing.items()))
            n = sum(r.currency == cur and r.date in dates for r in recs)
            raise ToolError(f"MissingFXRate: no {cur}/USD rate for {', '.join(sorted(dates))}; {n} {cur} "
                            f"record(s) cannot be converted and no rate may be estimated")
        used: dict[str, dict[str, float]] = {}
        for r in recs:
            used.setdefault(r.currency, {})[r.date] = float(ledger.rate_for(r))
        return {"month": month, "non_usd_records": len(recs),
                "rules": {"CNY": "USD = CNY / (CNY per USD on the record's date)",
                          "EUR/GBP": "USD = amount x (USD per unit on the record's date)"},
                "rates_used": used}

    def compute_breakdown(creator_id: str, month: str) -> dict:
        b = breakdown(creator_id, month)
        platforms = {}
        best, best_rate = None, None
        for p, t in b["platforms"].items():
            row = _money(t["usd"])
            if t["usd"]["gross"]:
                rate = t["usd"]["net"] / t["usd"]["gross"]
                row["net_rate"] = float(round(rate, 4))
                if best_rate is None or rate > best_rate:
                    best, best_rate = p, rate
            if "native_cny" in t:
                row["native_cny"] = _money(t["native_cny"])
            if "tips" in t:
                row["tips"] = {"tips_usd": ledger.cents(t["tips"]["gross"]),
                               "fee_on_tips_usd": ledger.cents(t["tips"]["fee"])}
            platforms[ledger.LABEL[p]] = row
        out = {"month": month, "currency": "USD", "platforms": platforms, "total": _money(b["total"]),
               "best_platform_by_net_rate": ledger.LABEL[best] if best else None}
        if not platforms:
            out["note"] = "no income records this month"
        return out

    def compute_set_aside(creator_id: str, month: str) -> dict:
        b = breakdown(creator_id, month)
        rate = ledger.D(creator(creator_id)["set_aside_rate"])
        return {"month": month, "total_net_usd": ledger.cents(b["total"]["net"]), "set_aside_rate": float(rate),
                "set_aside_usd": ledger.cents(b["total"]["net"] * rate), "note": DISCLAIMER}

    def simulate_patreon_ios(creator_id: str, month: str) -> dict:
        t = ledger.platform_totals(creator(creator_id), "patreon", check_month(month))
        if t is None:
            return {"month": month, "note": "no Patreon records this month", "impact_usd": 0.0}
        fee = ledger.D(ledger.assumptions()["patreon_ios_apple_fee_simulated"])
        return {"month": month, "ios_pledges_usd": ledger.cents(t["ios"]), "simulated_apple_fee_rate": float(fee),
                "impact_usd": ledger.cents(t["ios"] * fee)}

    def compare_months(creator_id: str, later_month: str, earlier_month: str) -> dict:
        later = breakdown(creator_id, later_month)["total"]["net"]
        earlier = breakdown(creator_id, earlier_month)["total"]["net"]
        return {"later_month": later_month, "later_net_usd": ledger.cents(later),
                "earlier_month": earlier_month, "earlier_net_usd": ledger.cents(earlier),
                "change_usd": ledger.cents(later - earlier)}

    def get_fee_details(creator_id: str, platform_name: str, month: str | None = None,
                        ref: str | None = None) -> dict:
        key = platform(platform_name)
        recs = ledger.records(creator(creator_id), key, check_month(month) if month else None)
        if ref:
            recs = [r for r in recs if r.ref == ref or r.contract_id == ref]
        if not recs:
            raise ToolError(f"no {key} records for {creator_id} (month={month}, ref={ref})")
        lines, by_kind = [], {}
        total_fee_usd = Decimal(0)
        fee_note = None
        for r in recs:
            line = {"date": r.date, "type": r.kind, "ref": r.ref or r.contract_id, "currency": r.currency,
                    "gross": float(r.gross), "platform_fee": None if r.fee_in_usd else float(r.platform_fee),
                    "payout_fee": float(r.payment_fee)}
            try:
                usd = ledger.to_usd(r)
                line["platform_fee_usd"] = ledger.cents(usd["platform_fee"])
                total_fee_usd += usd["platform_fee"]
            except ledger.MissingFXRate as e:
                line["platform_fee_usd"] = None
                line["error"] = f"MissingFXRate: no {e.currency}/USD rate for {', '.join(e.dates)}"
            if r.fee_in_usd:
                fee_note = "non-USD project fees are computed on the converted USD value; see platform_fee_usd"
            lines.append(line)
            k = by_kind.setdefault(r.kind, {"gross": Decimal(0), "platform_fee": Decimal(0)})
            k["gross"] += r.gross
            k["platform_fee"] += r.platform_fee
        rules = {"fiverr": "fiverr_service_fee_note", "freelancer": "freelancer_fee_note", "contra": "contra_note",
                 "upwork": "upwork_service_fee"}
        out = {"platform": ledger.LABEL[key], "records": lines,
               "subtotal_by_type_native": {k: _money(v) for k, v in by_kind.items()},
               "total_platform_fee_usd": ledger.cents(total_fee_usd),
               "fee_rule": ledger.assumptions().get(rules.get(key, ""), "fees as shown in the export")}
        if fee_note:
            out["note"] = fee_note
        if any(line.get("error") for line in lines):
            out["warning"] = "some records could not be converted to USD; total_platform_fee_usd excludes them"
        return out

    def get_upwork_contract_fees(creator_id: str, contract_id: str) -> dict:
        recs = [r for r in ledger.records(creator(creator_id), "upwork") if r.contract_id == contract_id]
        if not recs:
            raise ToolError(f"no Upwork payments on contract {contract_id!r} for {creator_id}")
        return {"contract_id": contract_id,
                "payments": [{"date": r.date, "amount_usd": float(r.gross), "fee_usd": float(r.platform_fee)}
                             for r in recs],
                "total_fee_usd": ledger.cents(sum((r.platform_fee for r in recs), Decimal(0)))}

    def tax_items(creator_id: str, period: str, after_date: str | None = None) -> dict:
        c = creator(creator_id)
        months = ledger.months_in(period)
        withheld: dict[str, dict[str, Decimal]] = {}
        net_total = Decimal(0)
        seen: set[str] = set()
        for m in months:
            b = breakdown(creator_id, m)
            net_total += b["total"]["net"]
            seen |= set(b["platforms"])
            for p, t in b["platforms"].items():
                if t["usd"]["withheld"]:
                    w = withheld.setdefault(p, {"usd": Decimal(0), "native_cny": Decimal(0)})
                    w["usd"] += t["usd"]["withheld"]
                    w["native_cny"] += t.get("native_cny", {}).get("withheld", Decimal(0))
        rate = ledger.D(c["set_aside_rate"])
        y, mo = int(months[-1][:4]), int(months[-1][5:7])
        period_end = (date(y + (mo == 12), mo % 12 + 1, 1) - timedelta(days=1)).isoformat()
        after = after_date or period_end
        by_platform = []
        for p, w in withheld.items():
            country, kind = ledger.WITHHOLDING.get(p, ("unknown", "tax withheld by the platform"))
            row = {"platform": ledger.LABEL[p], "country": country, "tax": kind,
                   "withheld_usd": ledger.cents(w["usd"])}
            if w["native_cny"]:
                row["withheld_cny"] = ledger.cents(w["native_cny"])
            by_platform.append(row)
        accountant = [f"Foreign tax withheld by {r['platform']} ({r['country']}): ${r['withheld_usd']} — ask "
                      f"whether it can be credited against your home-country tax"
                      for r in by_platform if r["country"] != c["tax_country"]]
        no_withholding = sorted(ledger.LABEL[p] for p in seen - set(withheld))
        if no_withholding:
            accountant.append("No tax was withheld on income from " + ", ".join(no_withholding)
                              + "; the set-aside covers it")
        return {"creator_id": c["creator_id"], "tax_country": c["tax_country"], "period": period, "months": months,
                "tax_withheld_by_platform": by_platform,
                "total_tax_withheld_usd": ledger.cents(sum((w["usd"] for w in withheld.values()), Decimal(0))),
                "total_net_usd": ledger.cents(net_total), "set_aside_rate": float(rate),
                "set_aside_usd": ledger.cents(net_total * rate),
                "next_us_estimated_tax_due": {"after": after, "due_date": ledger.next_us_estimated_tax_due(after),
                                              "schedule": ledger.assumptions()["us_estimated_tax_due_dates"]},
                "items_for_accountant": accountant, "note": DISCLAIMER}

    def submit_answer(answer=None, unit: str = "", explanation: str = "") -> dict:
        state["submitted"] = {"answer": answer, "unit": unit, "explanation": explanation}
        return {"status": "recorded"}

    tools = {f.__name__: f for f in (find_creator, convert_currency, compute_breakdown, compute_set_aside,
                                     simulate_patreon_ios, compare_months, get_upwork_contract_fees, tax_items,
                                     submit_answer)}
    # The schema calls the argument "platform"; the Python names avoid shadowing the helper.
    tools["load_platform"] = lambda creator_id, platform, month: load_platform(creator_id, platform, month)
    tools["get_fee_details"] = lambda creator_id, platform, month=None, ref=None: get_fee_details(
        creator_id, platform, month, ref)
    return tools

"""Response builders shared by the demo endpoints (api/main.py) and the bring-your-own-statements
endpoints (api/personal.py). They take a creator dict, so they work the same whether the records
come from the bundled demo data or from statements a user uploaded.

Amounts are in `currency`: USD (the default, and what the demo endpoints use) or CNY. Money keys
carry the currency as a suffix (`net_usd`, `net_cny`) where a response mixes amounts.

Manual income, expenses, the monthly goal and badges (daoshou/bookkeeping.py, daoshou/rewards.py)
are only ever added as new fields: every field the platform statements produce keeps its value.
"""
from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

from fastapi import HTTPException

from daoshou import agent_v2, bookkeeping, ledger, rewards

MONEY = ("gross", "platform_fee", "payout_fee", "withheld", "net")
ZERO = Decimal(0)
DISCLAIMER = agent_v2.DISCLAIMER
SYMBOL = {"USD": "$", "CNY": "¥"}


# ---------------------------------------------------------------- input checks

def check_month(month: str) -> str:
    if (len(month) != 7 or month[4] != "-" or not (month[:4] + month[5:]).isdigit()
            or not 1 <= int(month[5:]) <= 12):
        raise HTTPException(422, f"month must be YYYY-MM, got {month!r}")
    return month


def check_months(period: str) -> list[str]:
    try:
        months = ledger.months_in(period)
    except (ValueError, IndexError):
        raise HTTPException(422, f"period must be YYYY-MM, YYYY-Qn or YYYY-MM~YYYY-MM, got {period!r}") from None
    return [check_month(m) for m in months]


def check_day(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(422, f"date must be YYYY-MM-DD, got {value!r}") from None


def previous(month: str) -> str:
    y, m = int(month[:4]), int(month[5:])
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


# ---------------------------------------------------------------- building blocks

def profile(c: dict) -> dict:
    return {"id": c["creator_id"], "name": c["name"], "profile": c.get("profile"),
            "tax_country": c["tax_country"], "set_aside_rate": c["set_aside_rate"],
            "active_months": c.get("active_months", []),
            "platforms": [{"key": p, "label": ledger.LABEL.get(p, p), "account": acct,
                           "payout_method": ledger.payout_method(c, p)}
                          for p, acct in c["accounts"].items()]}


def money(values: dict) -> dict:
    return {k: ledger.cents(values[k]) for k in MONEY}


def ratio(a: Decimal, b: Decimal) -> float | None:
    return round(float(a / b), 4) if b else None


def _step(rec: ledger.Record, currency: str) -> dict:
    q = ledger.quote(rec, currency)
    rule = ("CNY per 1 USD (USD = CNY / rate)" if currency == "CNY"
            else f"USD per 1 {currency} (USD = amount × rate)")
    out = {"currency": currency, "rate": float(q.rate), "rate_date": q.rate_date, "rule": rule}
    if rec.rates is not None:
        out["source"] = q.source
    return out


def fx_steps(rec: ledger.Record, currency: str = "USD") -> dict:
    """The rates used for this record; raises ledger.MissingFXRate when one is missing.

    `fx` brings a non-USD record to USD. In CNY, `fx_cny` then brings the USD amount to CNY, and a
    CNY record needs neither (unless its fee is set in USD)."""
    if currency == "CNY":
        if rec.currency == "CNY" and not rec.fee_in_usd:
            return {"fx": None, "fx_cny": None}
        fx = _step(rec, rec.currency) if rec.currency != "USD" else None
        cny = {**_step(rec, "CNY"), "rule": "CNY per 1 USD (CNY = USD × rate)"}
        return {"fx": fx, "fx_cny": cny}
    return {"fx": _step(rec, rec.currency) if rec.currency != "USD" else None}


def book(creator: dict, months: list[str], currency: str = "USD") -> dict:
    """Record-level rows and per-platform totals for some months.

    Totals add the unrounded values and round once, like ledger.month_breakdown.
    Records that cannot be converted go to `issues` and are left out of every total.
    """
    sfx = currency.lower()
    rows, issues, per = [], [], {}
    for month in months:
        for p in ledger.PLATFORMS:
            for rec in ledger.records(creator, p, month):
                ref = rec.ref or rec.contract_id or None
                row = {"date": rec.date, "month": rec.month, "platform": p, "platform_label": ledger.LABEL[p],
                       "type": rec.kind, "ref": ref,
                       "original": {"currency": rec.currency, "gross": float(rec.gross),
                                    "platform_fee": None if rec.fee_in_usd else float(rec.platform_fee),
                                    "payout_fee": float(rec.payment_fee), "withheld": float(rec.withheld),
                                    "net": None if rec.fee_in_usd else float(rec.net)}}
                try:
                    steps = fx_steps(rec, currency)
                    conv = ledger.convert(rec, currency)
                except ledger.MissingFXRate as e:
                    row.update({"fx": None, **({"fx_cny": None} if currency == "CNY" else {}),
                                **{f"{k}_{sfx}": None for k in MONEY}, "issue": "missing_fx"})
                    rows.append(row)
                    issue = {"type": "missing_fx", "currency": e.currency, "date": rec.date,
                             "platform": ledger.LABEL[p],
                             "record": {"type": rec.kind, "ref": ref, "currency": rec.currency,
                                        "amount": float(rec.gross)},
                             "message": e.detail or f"No {e.currency}/USD rate for {rec.date}; this record is left "
                                                    f"out of the totals until the rate is added."}
                    if e.reason:  # uploaded statements say why: not in the rate file, ECB unavailable, …
                        issue["reason"] = e.reason
                    issues.append(issue)
                    continue
                vals = {"gross": conv["gross"], "platform_fee": conv["platform_fee"],
                        "payout_fee": conv["payment_fee"], "withheld": conv["withheld"], "net": conv["net"]}
                row.update(steps)
                row.update({f"{k}_{sfx}": ledger.cents(v) for k, v in vals.items()})
                rows.append(row)
                t = per.setdefault(p, {**{k: ZERO for k in MONEY}, "records": 0, "currencies": set(),
                                       "native_cny": {"gross": ZERO, "withheld": ZERO, "net": ZERO},
                                       "tips_gross": ZERO, "tips_fee": ZERO, "ios_pledges": ZERO})
                for k, v in vals.items():
                    t[k] += v
                t["records"] += 1
                t["currencies"].add(rec.currency)
                if rec.currency == "CNY":
                    for k in ("gross", "withheld", "net"):
                        t["native_cny"][k] += getattr(rec, k)
                if p == "fiverr" and rec.kind == "Tip":
                    t["tips_gross"] += vals["gross"]
                    t["tips_fee"] += vals["platform_fee"]
                if rec.ios:
                    t["ios_pledges"] += rec.ios if currency == "USD" else rec.ios * ledger.quote(rec, "CNY").rate
    rows.sort(key=lambda r: (r["date"], r["platform"]))
    total = {k: sum((t[k] for t in per.values()), ZERO) for k in MONEY}
    return {"rows": rows, "per": per, "total": total, "issues": issues}


def platform_rows(bk: dict) -> list[dict]:
    total_net = bk["total"]["net"]
    out = []
    for p, t in bk["per"].items():
        row = {"platform": p, "label": ledger.LABEL[p], **money(t), "net_rate": ratio(t["net"], t["gross"]),
               "share_of_net": ratio(t["net"], total_net), "records": t["records"],
               "currencies": sorted(t["currencies"])}
        if "CNY" in t["currencies"]:
            row["native_cny"] = {k: ledger.cents(v) for k, v in t["native_cny"].items()}
        if p == "fiverr":
            row["tips"] = {"gross": ledger.cents(t["tips_gross"]), "fee": ledger.cents(t["tips_fee"])}
        if p == "patreon":
            row["ios_pledges"] = ledger.cents(t["ios_pledges"])
            # Simulated: what Apple's in-app cut would take from the iOS share (assumptions.json).
            rate = ledger.D(ledger.assumptions()["patreon_ios_apple_fee_simulated"])
            row["ios_simulation"] = {"apple_fee_rate": float(rate), "apple_fee": ledger.cents(t["ios_pledges"] * rate),
                                     "simulated": True}
        out.append(row)
    return sorted(out, key=lambda r: -r["net"])


def best(platforms: list[dict]) -> dict | None:
    rated = [r for r in platforms if r["net_rate"] is not None]
    if not rated:
        return None
    top = max(rated, key=lambda r: r["net_rate"])
    return {"platform": top["platform"], "label": top["label"], "net_rate": top["net_rate"]}


def waterfall(total: dict) -> list[dict]:
    return [{"step": "gross", "label": "Gross income", "amount": ledger.cents(total["gross"])},
            {"step": "platform_fee", "label": "Platform fees", "amount": -ledger.cents(total["platform_fee"])},
            {"step": "payout_fee", "label": "Payout & payment fees", "amount": -ledger.cents(total["payout_fee"])},
            {"step": "withheld", "label": "Tax withheld by platforms", "amount": -ledger.cents(total["withheld"])},
            {"step": "net", "label": "Net", "amount": ledger.cents(total["net"])}]


# ---------------------------------------------------------------- whole responses

def tax(c: dict, months: list[str], period: str, after: str, currency: str = "USD") -> dict:
    sfx, sym = currency.lower(), SYMBOL[currency]
    bk = book(c, months, currency)
    by_platform = []
    for p, t in bk["per"].items():
        if not t["withheld"]:
            continue
        country, kind = ledger.WITHHOLDING.get(p, ("unknown", "tax withheld by the platform"))
        row = {"platform": ledger.LABEL[p], "country": country, "tax": kind,
               f"withheld_{sfx}": ledger.cents(t["withheld"])}
        if t["native_cny"]["withheld"] and currency != "CNY":
            row["withheld_cny"] = ledger.cents(t["native_cny"]["withheld"])
        by_platform.append(row)
    accountant = [f"Foreign tax withheld by {r['platform']} ({r['country']}): {sym}{r[f'withheld_{sfx}']} — ask "
                  f"whether it can be credited against your home-country tax"
                  for r in by_platform if r["country"] != c["tax_country"]]
    no_withholding = sorted(ledger.LABEL[p] for p, t in bk["per"].items() if not t["withheld"])
    if no_withholding:
        accountant.append("No tax was withheld on income from " + ", ".join(no_withholding)
                          + "; the set-aside covers it")
    for issue in bk["issues"]:
        accountant.append(f"Missing {issue['currency']}/USD rate for {issue['date']} ({issue['platform']}): "
                          f"that record is not in these totals yet")
    rate = ledger.D(c["set_aside_rate"])
    net = bk["total"]["net"]
    due = ledger.next_us_estimated_tax_due(after)
    return {"creator": profile(c), "period": period, "months": months, "currency": currency,
            "complete": not bk["issues"], "issues": bk["issues"],
            "tax_withheld_by_platform": by_platform,
            f"total_tax_withheld_{sfx}": ledger.cents(sum((t["withheld"] for t in bk["per"].values()), ZERO)),
            f"total_net_{sfx}": ledger.cents(net),
            "set_aside": {"rate": float(rate), "amount": ledger.cents(net * rate), "base": f"net income in {currency}",
                          "rate_source": "chosen by the creator"},
            "next_us_estimated_tax_due": {
                "after": after, "due_date": due,
                "days_left": (date.fromisoformat(due) - date.fromisoformat(after)).days if due else None,
                "schedule": ledger.assumptions()["us_estimated_tax_due_dates"]},
            "items_for_accountant": accountant,
            "forms": ledger.form_check(c, months, skip_missing=True), "note": DISCLAIMER}


# ---------------------------------------------------------------- manual entries, goal, badges

def entry_book(c: dict, months: list[str], currency: str = "USD") -> dict:
    """Manual income and expenses in these months: rows, totals by source and by category, issues."""
    sfx = currency.lower()
    rows, issues = [], []
    income = expenses = ZERO
    by_source: dict[str, dict] = {}
    by_category: dict[str, dict] = {}
    for e in bookkeeping.entries_of(c):
        rec = e.record
        if rec.month not in months:
            continue
        row = {"id": e.id, "date": rec.date, "month": rec.month, "kind": e.kind, "manual": True,
               "source": e.source, "category": e.category,
               "original": {"currency": rec.currency, "amount": float(rec.gross)}}
        try:
            steps = fx_steps(rec, currency)
            amount = ledger.convert(rec, currency)["net"]
        except ledger.MissingFXRate as err:
            row.update({"fx": None, **({"fx_cny": None} if currency == "CNY" else {}), f"amount_{sfx}": None,
                        "issue": "missing_fx"})
            rows.append(row)
            issue = {"type": "missing_fx", "currency": err.currency, "date": rec.date, "platform": None,
                     "entry": {"id": e.id, "kind": e.kind, "label": e.label, "currency": rec.currency,
                               "amount": float(rec.gross)},
                     "message": err.detail or f"No {err.currency}/USD rate for {rec.date}; this entry is left out "
                                              f"of the totals until the rate is added."}
            if err.reason:
                issue["reason"] = err.reason
            issues.append(issue)
            continue
        for step in steps.values():  # new rows, so the demo table is named as a source too
            if step and "source" not in step:
                step["source"] = ledger.quote(rec, step["currency"]).source
        row.update(steps)
        row[f"amount_{sfx}"] = ledger.cents(amount)
        rows.append(row)
        group = (by_source if e.kind == "income" else by_category).setdefault(e.label, {"amount": ZERO, "entries": 0})
        group["amount"] += amount
        group["entries"] += 1
        if e.kind == "income":
            income += amount
        else:
            expenses += amount
    return {"rows": rows, "income": income, "expenses": expenses, "by_source": by_source,
            "by_category": by_category, "issues": issues}


def _bookkeeping(c: dict, months: list[str], currency: str, bk: dict) -> tuple[dict, list]:
    """The new overview fields for these months, and any entries that couldn't be converted."""
    eb = entry_book(c, months, currency)
    net = bk["total"]["net"]
    everything = net + eb["income"]
    sources = ([{"source": ledger.LABEL[p], "platform": p, "manual": False, "amount": t["net"], "records": t["records"]}
                for p, t in bk["per"].items()]
               + [{"source": label, "platform": None, "manual": True, "amount": g["amount"], "records": g["entries"]}
                  for label, g in eb["by_source"].items()])
    order = {cat: i for i, cat in enumerate(bookkeeping.CATEGORIES)}
    fields = {
        "income_by_source": [{"source": r["source"], "platform": r["platform"], "manual": r["manual"],
                              "income": ledger.cents(r["amount"]), "share": ratio(r["amount"], everything),
                              "records": r["records"]}
                             for r in sorted(sources, key=lambda r: (-r["amount"], r["source"]))],
        "manual_income": {"total": ledger.cents(eb["income"]),
                          "entries": sum(g["entries"] for g in eb["by_source"].values()),
                          "sources": len(eb["by_source"])},
        "expenses": {"total": ledger.cents(eb["expenses"]),
                     "entries": sum(g["entries"] for g in eb["by_category"].values())},
        "expenses_by_category": [{"category": cat, "amount": ledger.cents(g["amount"]), "entries": g["entries"],
                                  "share": ratio(g["amount"], eb["expenses"])}
                                 for cat, g in sorted(eb["by_category"].items(), key=lambda kv: order[kv[0]])],
        "kept_after_expenses": {"platform_net": ledger.cents(net), "manual_income": ledger.cents(eb["income"]),
                                "expenses": ledger.cents(eb["expenses"]),
                                "kept": ledger.cents(net + eb["income"] - eb["expenses"]),
                                "rule": "platform net (fees already taken out) + manual income − expenses"},
    }
    return {**fields, "_rows": eb["rows"]}, eb["issues"]


def _rewards(c: dict, months: list[str], currency: str) -> dict:
    events = bookkeeping.events(c)
    goal = bookkeeping.goal_of(c)
    return {"goal": rewards.goal_progress(events, months, goal["amount"], goal["currency"]) if goal else None,
            "badges": rewards.badges(events, currency=currency, as_of=months[-1])}


def _with_entries(out: dict, issues: list) -> dict:
    if issues:
        out["issues"] = out["issues"] + issues
        out["complete"] = False
    return out


def overview(c: dict, month: str, currency: str = "USD") -> dict:
    bk = book(c, [month], currency)
    prev_month = previous(month)
    prev = book(c, [prev_month], currency)
    total = bk["total"]
    platforms = platform_rows(bk)
    # A month with no income after the creator started compares against 0; before that there is nothing to compare.
    active = c.get("active_months") or []
    has_prev = bool(prev["per"]) or bool(active and prev_month >= min(active))
    rate = ledger.D(c["set_aside_rate"])
    out = {"creator": profile(c), "month": month, "currency": currency,
           "complete": not bk["issues"], "issues": bk["issues"],
           "totals": money(total), "platforms": platforms, "best_keep_rate": best(platforms),
           "month_over_month": {
               "previous_month": prev_month,
               "previous_net": ledger.cents(prev["total"]["net"]) if has_prev else None,
               "change": ledger.cents(total["net"] - prev["total"]["net"]) if has_prev else None,
               "change_pct": ratio(total["net"] - prev["total"]["net"], prev["total"]["net"]) if has_prev else None,
               "previous_complete": not prev["issues"]},
           "set_aside": {"rate": float(rate), "amount": ledger.cents(total["net"] * rate),
                         "base": f"net income in {currency}", "note": DISCLAIMER}}
    extra, issues = _bookkeeping(c, [month], currency, bk)
    extra.pop("_rows")
    return _with_entries({**out, **extra, **_rewards(c, [month], currency)}, issues)


def ledger_view(c: dict, month: str, currency: str = "USD") -> dict:
    bk = book(c, [month], currency)
    out = {"creator": profile(c), "month": month, "currency": currency,
           "complete": not bk["issues"], "issues": bk["issues"],
           "rows": bk["rows"], "totals": money(bk["total"]), "waterfall": waterfall(bk["total"])}
    extra, issues = _bookkeeping(c, [month], currency, bk)
    return _with_entries({**out, "entry_rows": extra["_rows"], "manual_income": extra["manual_income"],
                          "expenses": extra["expenses"], "kept_after_expenses": extra["kept_after_expenses"]}, issues)


def forms(c: dict, period: str, months: list[str]) -> dict:
    """Tax forms vs what landed: what each platform's form would show, the gap, threshold and duplicates."""
    return {"creator": profile(c), "period": period, "currency": "USD",
            **ledger.form_check(c, months, skip_missing=True), "note": DISCLAIMER}


def report(c: dict, period: str, months: list[str], after: str, currency: str = "USD") -> dict:
    bk = book(c, months, currency)
    platforms = platform_rows(bk)
    by_month, kept_by_month = [], []
    for m in months:
        mb = book(c, [m], currency)
        by_month.append({"month": m, **money(mb["total"]), "complete": not mb["issues"],
                         "platforms": len(mb["per"])})
        month_extra, month_issues = _bookkeeping(c, [m], currency, mb)
        kept = {k: v for k, v in month_extra["kept_after_expenses"].items() if k != "rule"}
        kept_by_month.append({"month": m, **kept, "complete": not mb["issues"] and not month_issues})
    used = {(s["currency"], s["rate_date"], s["rate"], s.get("source")) for r in bk["rows"]
            for s in (r.get("fx"), r.get("fx_cny")) if s}
    out = {"title": f"Side income report — {c['name']} — {period}", "creator": profile(c), "period": period,
           "months": months, "generated_on": date.today().isoformat(), "currency": currency,
           "complete": not bk["issues"], "issues": bk["issues"],
           "totals": money(bk["total"]), "waterfall": waterfall(bk["total"]),
           "by_month": by_month, "by_platform": platforms, "best_keep_rate": best(platforms),
           "fx_used": [{"currency": cur, "date": d, "rate": rate, **({"source": src} if src else {})}
                       for cur, d, rate, src in sorted(used, key=lambda u: u[:3])],
           "tax": tax(c, months, period, after, currency),
           "assumptions_note": ledger.assumptions().get("note"), "disclaimer": DISCLAIMER}
    extra, issues = _bookkeeping(c, months, currency, bk)
    extra["entry_rows"] = extra.pop("_rows")
    return _with_entries({**out, **extra, "kept_by_month": kept_by_month, **_rewards(c, months, currency)}, issues)


def step_event(step: dict) -> dict:
    if step["type"] == "llm":
        return {"type": "llm", "name": step["name"], "status": step["status"], "tool_calls": step["tool_calls"],
                "text": step["text"][:2000], "duration_ms": step["duration_ms"]}
    result = step["result"]
    try:
        parsed = json.loads(result) if len(result) <= 6000 else None
    except json.JSONDecodeError:
        parsed = None
    return {"type": "tool", "name": step["name"], "args": step["args"], "status": step["status"],
            "error": step["error"], "result_summary": result[:300], "result": parsed,
            "duration_ms": step["duration_ms"]}

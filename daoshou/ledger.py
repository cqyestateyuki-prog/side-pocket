"""Deterministic money math for v2: parse exports into one ledger, convert, break down.

Mirrors daoshou_testdata/tools/check_answers.py: each non-USD record is converted
at its own date's rate (CNY: USD = CNY / rate; EUR/GBP: USD = amount × rate),
per-record platform fees are rounded to the cent before summing, withholding
stays its own line, and amounts are only rounded to cents (ROUND_HALF_UP) when
they are reported.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache

from . import data
from .fx import Quote, Rates

PLATFORMS = ["bilibili", "youtube", "twitch", "patreon", "upwork", "fiverr", "freelancer", "contra"]
LABEL = {"bilibili": "B站", "youtube": "YouTube", "twitch": "Twitch", "patreon": "Patreon", "upwork": "Upwork",
         "fiverr": "Fiverr", "freelancer": "Freelancer.com", "contra": "Contra"}
ALIASES = {"b站": "bilibili", "b 站": "bilibili", "哔哩哔哩": "bilibili", "freelancer.com": "freelancer",
           **{p: p for p in PLATFORMS}}
# Which country's tax a platform withholds in this data set: (country, what it is).
WITHHOLDING = {"bilibili": ("CN", "individual income tax withheld by the platform"),
               "youtube": ("US", "withholding on US-viewer revenue")}
FIELDS = ("gross", "platform_fee", "payment_fee", "withheld", "net")
CENT = Decimal("0.01")


class MissingFXRate(Exception):
    def __init__(self, currency: str, dates: list[str]):
        self.currency, self.dates = currency, dates
        super().__init__(f"no {currency}/USD rate for {', '.join(dates)}")


def cents(x: Decimal) -> float:
    return float(x.quantize(CENT, rounding=ROUND_HALF_UP))


def D(value: str | float) -> Decimal:
    return Decimal(str(value).replace(",", "").replace("$", "").strip() or "0")


def platform_key(name: str) -> str:
    key = ALIASES.get(name.strip().lower())
    if key is None:
        raise ValueError(f"unknown platform {name!r}")
    return key


@lru_cache
def assumptions() -> dict:
    return json.loads((data.DATA / "assumptions.json").read_text(encoding="utf-8"))


@dataclass
class Record:
    platform: str
    date: str          # YYYY-MM-DD (Patreon: first of the month)
    kind: str
    currency: str
    gross: Decimal
    platform_fee: Decimal
    payment_fee: Decimal
    withheld: Decimal
    net: Decimal
    contract_id: str = ""   # Upwork contract
    ref: str = ""           # Fiverr order / Freelancer.com project
    ios: Decimal = Decimal(0)
    fee_in_usd: bool = False  # fee only known after conversion (non-USD Freelancer.com projects)
    txns: int = 1             # payment transactions this row stands for (Patreon: patrons; fees: 0)
    rates: Rates | None = None  # uploaded statements: their own rates (None = the bundled demo tables)

    @property
    def month(self) -> str:
        return self.date[:7]


def _iso(raw: str, fmt: str) -> str:
    return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")


def _payout_fee(platform: str, date: str, kind: str, amount: Decimal) -> Record:
    return Record(platform, date, kind, "USD", Decimal(0), Decimal(0), amount, Decimal(0), -amount, txns=0)


def _parse(platform: str, r: dict) -> Record:
    a = assumptions()
    if platform == "bilibili":
        return Record(platform, _iso(r["日期"], "%Y/%m/%d"), r["收入类型"], "CNY", D(r["流水(元)"]),
                      D(r["平台分成(元)"]), Decimal(0), D(r["已代扣个税(元)"]), D(r["实际到账(元)"]))
    if platform == "youtube":
        return Record(platform, _iso(r["Date"], "%Y-%m-%d"), r["Revenue Type"], "USD", D(r["Gross Revenue (USD)"]),
                      D(r["YouTube Share (USD)"]), Decimal(0), D(r["US Tax Withheld (USD)"]),
                      D(r["Estimated Revenue (USD)"]))
    if platform == "twitch":
        return Record(platform, _iso(r["Date"], "%m/%d/%Y"), r["Revenue Type"], "USD", D(r["Gross (USD)"]),
                      D(r["Twitch Share (USD)"]), Decimal(0), Decimal(0), D(r["Payout (USD)"]))
    if platform == "patreon":
        return Record(platform, _iso(r["Month"], "%b %Y"), "Pledges", "USD", D(r["Gross Pledges (USD)"]),
                      D(r["Patreon Fee (USD)"]), D(r["Payment Processing (USD)"]), Decimal(0),
                      D(r["Payout (USD)"]), ios=D(r["iOS Pledges (USD)"]), txns=int(r["Patrons"]))
    if platform == "upwork":
        date, amount = _iso(r["Date"], "%b %d, %Y"), D(r["Amount (USD)"])
        if r["Type"] == "Withdrawal Fee":
            return _payout_fee(platform, date, "Withdrawal Fee", amount)
        rate = D(r["Service Fee Rate"].rstrip("%")) / 100
        fee = (amount * rate).quantize(CENT, rounding=ROUND_HALF_UP)  # each fee is rounded to the cent
        return Record(platform, date, r["Type"], "USD", amount, fee, Decimal(0), Decimal(0), amount - fee,
                      contract_id=r["Contract ID"])
    if platform == "fiverr":
        date, amount = _iso(r["Completed At (UTC)"][:10], "%Y-%m-%d"), D(r["Amount (USD)"])
        if r["Item"] == "Withdrawal Fee":
            return _payout_fee(platform, date, "Withdrawal Fee", amount)
        # 20% of every order, extra and tip, each rounded to the cent
        fee = (amount * D(a["fiverr_service_fee"])).quantize(CENT, rounding=ROUND_HALF_UP)
        return Record(platform, date, r["Item"], "USD", amount, fee, Decimal(0), Decimal(0), amount - fee,
                      ref=r["Order ID"])
    if platform == "freelancer":
        date, amount = _iso(r["date"], "%Y%m%d"), D(r["project_amount"])
        if r["entry_type"] == "Withdrawal Fee":
            return _payout_fee(platform, date, "Withdrawal Fee", amount)
        if r["currency"] != "USD":  # the $5 minimum applies to the USD value, so the fee waits for conversion
            return Record(platform, date, r["entry_type"], r["currency"], amount, Decimal(0), Decimal(0),
                          Decimal(0), amount, ref=r["project_id"], fee_in_usd=True)
        fee = freelancer_fee(amount)
        return Record(platform, date, r["entry_type"], "USD", amount, fee, Decimal(0), Decimal(0), amount - fee,
                      ref=r["project_id"])
    if platform == "contra":
        amount = D(r["Amount"])
        return Record(platform, _iso(r["Paid On"], "%B %d, %Y"), "Payment", "USD", amount, Decimal(0), Decimal(0),
                      Decimal(0), amount, ref=r["Project"])
    raise ValueError(platform)


def freelancer_fee(amount_usd: Decimal) -> Decimal:
    """10% of the project's USD value or $5, whichever is greater, rounded to the cent."""
    a = assumptions()
    return max(amount_usd * D(a["freelancer_fee_rate"]), D(a["freelancer_min_fee"])).quantize(
        CENT, rounding=ROUND_HALF_UP)


def records(creator: dict, platform: str, month: str | None = None) -> list[Record]:
    if "records" in creator:  # uploaded statements, parsed already (daoshou/statements.py)
        out = creator["records"].get(platform, [])
    else:
        account = creator["accounts"].get(platform)
        if account is None:
            return []
        _, rows = data.export_rows(platform)
        col = data.EXPORTS[platform][1]
        out = [_parse(platform, r) for r in rows if r[col] == account]
    return [r for r in out if month is None or r.month == month]


def _demo_quote(currency: str, day: str) -> Quote | None:
    if currency == "CNY":
        rate = data.fx_rates().get(day)
    else:
        rate = data.fx_usd_per_unit().get(day, {}).get(currency)
    return Quote(D(rate), day, "demo table") if rate is not None else None


def quote(rec: Record, currency: str | None = None) -> Quote:
    """The rate for `currency` (default: the record's own) on the record's date; raises MissingFXRate."""
    currency = currency or rec.currency
    q = rec.rates.get(currency, rec.date) if rec.rates is not None else _demo_quote(currency, rec.date)
    if q is None:
        raise MissingFXRate(currency, [rec.date])
    return q


def rate_for(rec: Record) -> Decimal | None:
    """The rate used to bring this record to USD (CNY per USD for CNY, USD per unit otherwise); None for USD."""
    if rec.currency == "USD":
        return None
    return quote(rec).rate


def to_usd(rec: Record) -> dict[str, Decimal]:
    rate = rate_for(rec)
    if rate is None:
        return {f: getattr(rec, f) for f in FIELDS}
    if rec.fee_in_usd:
        gross = rec.gross * rate
        fee = freelancer_fee(gross)
        return {"gross": gross, "platform_fee": fee, "payment_fee": Decimal(0), "withheld": Decimal(0),
                "net": gross - fee}
    if rec.currency == "CNY":
        return {f: getattr(rec, f) / rate for f in FIELDS}
    return {f: getattr(rec, f) * rate for f in FIELDS}


def to_cny(rec: Record) -> dict[str, Decimal]:
    """CNY records as they are; anything else via USD at the CNY per USD rate on the record's date."""
    if rec.currency == "CNY" and not rec.fee_in_usd:
        return {f: getattr(rec, f) for f in FIELDS}
    rate = quote(rec, "CNY").rate
    return {f: v * rate for f, v in to_usd(rec).items()}


def convert(rec: Record, currency: str = "USD") -> dict[str, Decimal]:
    return to_cny(rec) if currency == "CNY" else to_usd(rec)


def missing_rates(recs: list[Record]) -> dict[str, list[str]]:
    """currency -> dates in these records that have no exchange rate."""
    out: dict[str, list[str]] = {}
    for r in recs:
        if r.currency == "USD":
            continue
        try:
            rate_for(r)
        except MissingFXRate:
            out.setdefault(r.currency, [])
            if r.date not in out[r.currency]:
                out[r.currency].append(r.date)
    return out


def check_rates(recs: list[Record]) -> None:
    missing = missing_rates(recs)
    if missing:
        cur, dates = next(iter(missing.items()))
        raise MissingFXRate(cur, sorted(dates))


def platform_totals(creator: dict, platform: str, month: str) -> dict | None:
    recs = records(creator, platform, month)
    if not recs:
        return None
    check_rates(recs)
    tot = {f: Decimal(0) for f in FIELDS}
    for r in recs:
        for f, v in to_usd(r).items():
            tot[f] += v
    out = {"usd": tot, "records": len(recs), "currencies": sorted({r.currency for r in recs})}
    if platform == "bilibili":
        out["native_cny"] = {f: sum((getattr(r, f) for r in recs), Decimal(0)) for f in ("gross", "withheld", "net")}
    if platform == "patreon":
        out["ios"] = sum((r.ios for r in recs), Decimal(0))
    if platform == "fiverr":
        tips = [r for r in recs if r.kind == "Tip"]
        out["tips"] = {"gross": sum((r.gross for r in tips), Decimal(0)),
                       "fee": sum((r.platform_fee for r in tips), Decimal(0))}
    return out


def month_breakdown(creator: dict, month: str) -> dict:
    per = {p: t for p in PLATFORMS if (t := platform_totals(creator, p, month)) is not None}
    total = {f: sum((t["usd"][f] for t in per.values()), Decimal(0)) for f in FIELDS}
    return {"platforms": per, "total": total}


def months_in(period: str) -> list[str]:
    """'2026-09' -> ['2026-09']; '2026-Q3' -> its three months; '2026-07~2026-09' -> the range."""
    period = period.strip()
    if "-Q" in period.upper():
        year, q = period.upper().split("-Q")
        start = (int(q) - 1) * 3 + 1
        return [f"{year}-{m:02d}" for m in range(start, start + 3)]
    if "~" in period:
        a, b = (p.strip() for p in period.split("~"))
        y, m = int(a[:4]), int(a[5:7])
        out = []
        while f"{y}-{m:02d}" <= b:
            out.append(f"{y}-{m:02d}")
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        return out
    return [period]


def next_us_estimated_tax_due(after: str) -> str | None:
    return next((d for d in assumptions()["us_estimated_tax_due_dates"] if d > after), None)


# ---------------------------------------------------------------- tax forms vs what landed

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"]


def coverage_months(creator: dict, months: list[str]) -> list[str]:
    """The calendar-year months the data covers: the demo data has July–September 2026; uploaded
    statements cover their first to last month in the year of the period asked about."""
    if "records" not in creator:
        return assumptions()["data_coverage_months"]
    year = months[-1][:4]
    seen = sorted({r.month for recs in creator["records"].values() for r in recs if r.month[:4] == year})
    return months_in(f"{seen[0]}~{seen[-1]}") if seen else months


def _span(months: list[str]) -> str:
    first, last = (MONTH_NAMES[int(m[5:]) - 1] for m in (months[0], months[-1]))
    return first if first == last else f"{first}–{last}"


def payout_method(creator: dict, platform: str) -> str:
    return creator.get("payout_methods", {}).get(platform) or assumptions()["payout_method_default"]


def _form_sums(pairs: list[tuple[Record, dict[str, Decimal]]]) -> dict:
    """Form view = every positive payment before fees, in USD; refunds are listed, not netted."""
    out = {"form_gross": Decimal(0), "refunds": Decimal(0), "transactions": 0,
           **{f: Decimal(0) for f in ("platform_fee", "payment_fee", "withheld", "net")}}
    for rec, usd in pairs:
        if rec.gross > 0:
            out["form_gross"] += usd["gross"]
            out["transactions"] += rec.txns
        elif rec.gross < 0:
            out["refunds"] -= usd["gross"]
        for f in ("platform_fee", "payment_fee", "withheld", "net"):
            out[f] += usd[f]
    return out


def form_check(creator: dict, months: list[str], *, skip_missing: bool = False) -> dict:
    """Per platform: the form a US person would typically get (simulated), what that form would show
    (gross before fees) against what actually landed, the itemised gap, transactions, the calendar-year
    1099-K threshold status, and a possible-duplicate flag when payouts go to an app that files its own
    1099-K. Informational only.

    Raises MissingFXRate unless skip_missing, in which case unconvertible records are left out and listed
    under `issues`.
    """
    a = assumptions()
    forms, k = a["tax_forms"], a["form_1099k_threshold"]
    coverage = coverage_months(creator, months)
    pace = Decimal(12) / Decimal(len(coverage))
    span = _span(coverage)
    apps = set(a["payout_apps_issuing_1099k"])
    issues: dict[tuple, dict] = {}

    def converted(recs: list[Record]) -> list[tuple[Record, dict[str, Decimal]]]:
        pairs = []
        for r in recs:
            try:
                pairs.append((r, to_usd(r)))
            except MissingFXRate as e:
                if not skip_missing:
                    raise
                issues[(r.platform, r.date, r.ref)] = {
                    "type": "missing_fx", "currency": e.currency, "date": r.date, "platform": LABEL[r.platform],
                    "ref": r.ref or None, "amount": float(r.gross)}
        return pairs

    rows = []
    for p in PLATFORMS:
        if p not in creator["accounts"]:
            continue
        recs = [r for m in months for r in records(creator, p, m)]
        if not recs:
            continue
        s = _form_sums(converted(recs))
        year = _form_sums(converted([r for m in coverage for r in records(creator, p, m)]))
        profile = forms[p]
        method = payout_method(creator, p)
        proj_gross, proj_txns = year["form_gross"] * pace, int(year["transactions"] * pace)
        if profile["form"] == "1099-K":
            if year["form_gross"] > k["gross_usd"] and year["transactions"] > k["transactions"]:
                status, meaning = "over_so_far", (f"Already over the 1099-K threshold this year: expect a 1099-K "
                                                  f"from {profile['issuer']} showing the gross, before fees.")
            elif proj_gross > k["gross_usd"] and proj_txns > k["transactions"]:
                status, meaning = "projected_over", (f"At the {span} pace (a projection) this passes the "
                                                     "1099-K threshold by year end; a 1099-K is likely.")
            else:
                status, meaning = "below", ("Below the 1099-K threshold so far and at the current pace: you may "
                                            "get no 1099-K, but this income is still reportable.")
            threshold = {"rule": k["rule"], "gross_usd": k["gross_usd"], "transactions": k["transactions"],
                         "simulated": False}
        elif profile["form"] in ("1099-MISC", "1099-NEC"):
            t = D(a["form_1099misc_threshold_usd"])
            status = ("over_so_far" if year["form_gross"] >= t else "projected_over" if proj_gross >= t else "below")
            meaning = {"over_so_far": f"Likely gets a {profile['form']} (simulated threshold already reached).",
                       "projected_over": f"Likely gets a {profile['form']} by year end at the current pace "
                                         f"(projection; simulated threshold).",
                       "below": "Below the simulated form threshold: you may get no form, but this income is "
                                "still reportable."}[status]
            threshold = {"rule": a["form_1099misc_note"], "gross_usd": float(t), "simulated": True}
        else:
            status, meaning = "not_applicable", profile["note"]
            threshold = None
        duplicate = profile["form"] != "none" and method in apps
        has_form = profile["form"] != "none"
        rows.append({
            "platform": p, "label": LABEL[p], "form": profile["form"], "issuer": profile["issuer"],
            "form_note": profile["note"], "payout_method": method,
            "form_view_gross_usd": cents(s["form_gross"]) if has_form else None,
            "bank_view_landed_usd": cents(s["net"]),
            "gap_usd": cents(s["form_gross"] - s["net"]) if has_form else None,
            "gap_items_usd": {"platform_fees": cents(s["platform_fee"]), "payout_fees": cents(s["payment_fee"]),
                              "tax_withheld": cents(s["withheld"]), "refunds": cents(s["refunds"])},
            "transactions": s["transactions"],
            "calendar_year": {"basis": f"records for {coverage[0]}–{coverage[-1]} (the months in Side Atlas)",
                              "so_far_form_gross_usd": cents(year["form_gross"]),
                              "so_far_transactions": year["transactions"],
                              "projected_full_year_gross_usd": cents(proj_gross),
                              "projected_full_year_transactions": proj_txns,
                              "projection": f"{span} × {pace} — a projection, not actual",
                              "threshold": threshold, "status": status, "meaning": meaning},
            "possible_duplicate_report": duplicate,
            **({"duplicate_note": a["duplicate_report_note"]} if duplicate else {}),
        })
    with_forms = [r for r in rows if r["form_view_gross_usd"] is not None]
    notes = [a["income_reportable_note"], a["tax_forms_note"], a["form_gap_rule"]]
    if any(r["possible_duplicate_report"] for r in rows):
        notes.append(a["duplicate_report_note"])
    return {
        "months": months, "platforms": rows,
        "totals_for_platforms_with_forms": {
            "form_view_gross_usd": round(sum(r["form_view_gross_usd"] for r in with_forms), 2),
            "bank_view_landed_usd": round(sum(r["bank_view_landed_usd"] for r in with_forms), 2),
            "gap_usd": round(sum(r["gap_usd"] for r in with_forms), 2)},
        "platforms_over_1099k_threshold": [r["label"] for r in rows if r["form"] == "1099-K"
                                           and r["calendar_year"]["status"] in ("over_so_far", "projected_over")],
        "possible_duplicate_reports": [r["label"] for r in rows if r["possible_duplicate_report"]],
        "complete": not issues, "issues": list(issues.values()), "notes": notes,
    }

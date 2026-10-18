"""Monthly goal and milestone badges, worked out from the ledger. Pure functions, no I/O.

Everything here runs on `Event`s: one per platform record (its net, after the platform's fees and
any tax it withheld) and one per manual entry. "Income" means platform net plus manual income,
before expenses, which is what the goal and the badges measure.

Currencies: badges with a fixed amount (1,000 in a month, 10,000 in total) compare the USD value,
so they mean the same thing whatever the display currency; the numbers come back in both. Badges
that compare months with each other (best month, growth) use the display currency, which is what
the person sees. An event with no exchange rate is left out of every sum, never estimated.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

MONTH_USD = Decimal(1000)
TOTAL_USD = Decimal(10_000)
SOURCES = 5
STREAK = 3
BASIS = "income: platform net plus manual income, before expenses"


@dataclass(frozen=True)
class Event:
    date: str               # YYYY-MM-DD
    kind: str               # "income" | "expense"
    source: str             # platform label, or the person's own label; expenses: the category
    platform: str | None    # statement platform key; None for a manual entry
    currency: str           # the record's own currency
    positive: bool          # a payment (not a fee or refund row)
    usd: Decimal | None     # net in USD; None when there is no rate
    cny: Decimal | None     # net in CNY; None when there is no rate

    @property
    def month(self) -> str:
        return self.date[:7]

    def value(self, currency: str) -> Decimal | None:
        return self.usd if currency == "USD" else self.cny


def _c(x: Decimal) -> float:
    return float(x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def last_day(month: str) -> str:
    y, m = int(month[:4]), int(month[5:])
    return (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).isoformat()


def month_range(first: str, last: str) -> list[str]:
    out, y, m = [], int(first[:4]), int(first[5:])
    while f"{y}-{m:02d}" <= last:
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def _source_key(e: Event) -> str:
    return e.platform or "manual:" + e.source.strip().lower()


def _crossing(events: list[Event], currency: str, above: Decimal, *, strictly: bool = False) -> str | None:
    """Date the running total of these events first reaches `above` (or passes it, if strictly)."""
    run = Decimal(0)
    for e in events:
        v = e.value(currency)
        if v is None:
            continue
        run += v
        if run > above or (not strictly and run == above):
            return e.date
    return None


def _badge(bid: str, earned_on: str | None, numbers: dict, progress: dict | None = None) -> dict:
    return {"id": bid, "title_key": f"badge.{bid}", "earned": earned_on is not None, "earned_on": earned_on,
            "numbers": numbers, "progress": None if earned_on else progress}


def badges(events: list[Event], *, currency: str, as_of: str) -> list[dict]:
    """Every badge, earned or not, as of the end of month `as_of`, in a fixed order."""
    until = last_day(as_of)
    income = sorted((e for e in events if e.kind == "income" and e.date <= until), key=lambda e: (e.date, e.source))
    everything = [e for e in events if e.date <= until]
    if not income:
        months: list[str] = []
    else:
        months = month_range(income[0].month, as_of)
    by_month = {m: [e for e in income if e.month == m] for m in months}

    def total(m: str, cur: str) -> Decimal:
        return sum((v for e in by_month[m] if (v := e.value(cur)) is not None), Decimal(0))

    shown = {m: total(m, currency) for m in months}
    usd = {m: total(m, "USD") for m in months}
    out = []

    # first month over 1,000 (USD)
    first = next((m for m in months if usd[m] >= MONTH_USD), None)
    if first:
        out.append(_badge("first_1k_month", _crossing(by_month[first], "USD", MONTH_USD),
                          {"month": first, "income_usd": _c(usd[first]), "threshold_usd": float(MONTH_USD),
                           "income": _c(shown[first]), "currency": currency}))
    else:
        best_usd = max(usd.values(), default=Decimal(0))
        out.append(_badge("first_1k_month", None, {"threshold_usd": float(MONTH_USD)},
                          {"current": _c(best_usd), "target": float(MONTH_USD), "unit": "USD"}))

    # best month so far: the latest month that beat every month before it
    record = None
    for i, m in enumerate(months):
        if i and shown[m] > max(shown[p] for p in months[:i]):
            prev = max(months[:i], key=lambda p: (shown[p], p))
            record = (m, prev)
    if record:
        m, prev = record
        out.append(_badge("best_month", _crossing(by_month[m], currency, shown[prev], strictly=True),
                          {"month": m, "income": _c(shown[m]), "previous_best_month": prev,
                           "previous_best": _c(shown[prev]), "currency": currency}))
    else:
        top = max(months, key=lambda p: (shown[p], p)) if months else None
        out.append(_badge("best_month", None, {"best_month": top, "best": _c(shown[top]) if top else None,
                                               "currency": currency}))

    # three months of growth in a row: three month-over-month increases
    streak, done = 0, None
    for i in range(1, len(months)):
        streak = streak + 1 if shown[months[i]] > shown[months[i - 1]] else 0
        if streak == STREAK and done is None:
            done = i
    if done is not None:
        run = months[done - STREAK:done + 1]
        out.append(_badge("growth_streak_3",
                          _crossing(by_month[months[done]], currency, shown[months[done - 1]], strictly=True),
                          {"months": run, "income": [_c(shown[m]) for m in run], "currency": currency}))
    else:
        out.append(_badge("growth_streak_3", None, {"currency": currency},
                          {"current": streak, "target": STREAK, "unit": "months"}))

    # sources: first payment from each platform or manual source
    firsts: dict[str, Event] = {}
    for e in income:
        if e.positive and _source_key(e) not in firsts:
            firsts[_source_key(e)] = e
    ordered = sorted(firsts.values(), key=lambda e: (e.date, e.source))
    start = ordered[0].month if ordered else None
    added = [e for e in ordered if e.month > start] if start else []
    if added:
        out.append(_badge("new_source", added[0].date,
                          {"source": added[0].source, "manual": added[0].platform is None,
                           "added": [{"source": e.source, "manual": e.platform is None, "first_date": e.date}
                                     for e in added]}))
    else:
        out.append(_badge("new_source", None, {"sources": len(ordered)}))
    if len(ordered) >= SOURCES:
        out.append(_badge("five_sources", ordered[SOURCES - 1].date,
                          {"fifth": ordered[SOURCES - 1].source, "sources": [e.source for e in ordered[:SOURCES]],
                           "count": len(ordered)}))
    else:
        out.append(_badge("five_sources", None, {"sources": [e.source for e in ordered]},
                          {"current": len(ordered), "target": SOURCES, "unit": "sources"}))

    # first income in a new currency: one not seen on the first day of income
    seen: dict[str, str] = {}
    for e in income:
        if e.positive:
            seen.setdefault(e.currency, e.date)
    first_day = min(seen.values(), default=None)
    new = sorted((d, c) for c, d in seen.items() if d > first_day) if first_day else []
    if new:
        d, cur = new[0]
        out.append(_badge("new_currency", d, {"currency": cur, "first_date": d,
                                              "earlier_currencies": sorted(c for c, x in seen.items() if x < d)}))
    else:
        out.append(_badge("new_currency", None, {"currencies": sorted(seen)}))

    # total over 10,000 (USD), all months together
    cumulative = sum((e.usd for e in income if e.usd is not None), Decimal(0))
    crossed = _crossing(income, "USD", TOTAL_USD)
    out.append(_badge("total_10k", crossed,
                      {"threshold_usd": float(TOTAL_USD), "total_usd": _c(cumulative)},
                      {"current": _c(cumulative), "target": float(TOTAL_USD), "unit": "USD"}))

    # a complete month: every platform started by then has records, and nothing lacks a rate
    complete = None
    for m in months:
        started = {e.platform for e in everything if e.platform and e.date <= last_day(m)}
        in_month = [e for e in everything if e.month == m]
        present = {e.platform for e in in_month if e.platform}
        if started and started <= present and all(e.value(currency) is not None for e in in_month):
            complete = (m, len(started), max(e.date for e in in_month))
            break
    if complete:
        m, n, last = complete
        out.append(_badge("complete_month", last, {"month": m, "platforms": n}))
    else:
        out.append(_badge("complete_month", None, {}))
    return out


def goal_progress(events: list[Event], months: list[str], amount: Decimal, currency: str) -> dict:
    """Progress toward a monthly income goal of `amount` in `currency` (USD or CNY), month by month."""
    rows = []
    for m in months:
        inc = sorted((e for e in events if e.kind == "income" and e.month == m), key=lambda e: (e.date, e.source))
        total = sum((v for e in inc if (v := e.value(currency)) is not None), Decimal(0))
        reached = total >= amount
        rows.append({"month": m, "income": _c(total), "progress": round(float(total / amount), 4),
                     "remaining": _c(max(amount - total, Decimal(0))), "reached": reached,
                     "reached_on": _crossing(inc, currency, amount) if reached else None,
                     "complete": all(e.value(currency) is not None for e in inc)})
    return {"amount": _c(amount), "currency": currency, "basis": BASIS, "months": rows,
            "months_reached": sum(r["reached"] for r in rows)}

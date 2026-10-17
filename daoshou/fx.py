"""Exchange rates for statements a user uploads.

Directions match the bundled demo tables: CNY is kept as CNY per 1 USD (USD = CNY / rate) and
every other currency as USD per 1 unit (USD = amount × rate).

Where a rate comes from, per currency:
1. The user's own rate file, if they uploaded one for that currency. It is used exactly as given:
   a date the file doesn't cover has no rate, and the record is reported as missing, never estimated.
2. Otherwise ECB euro reference rates (via api.frankfurter.dev), crossed through EUR. The ECB only
   publishes on working days, so a record dated on a weekend or holiday uses the last rate published
   on or before its date, and the record shows which date that is. Only currency codes and a date
   range are sent to fetch them, never amounts or anything else from the statements.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from functools import lru_cache

import httpx

ECB_URL = "https://api.frankfurter.dev/v1"
UPLOADED, ECB = "your rate file", "ECB reference rate"


@dataclass(frozen=True)
class Quote:
    rate: Decimal
    rate_date: str
    source: str


class Rates:
    def __init__(self, uploaded: dict[str, dict[str, Decimal]] | None = None,
                 reference: dict[str, dict[str, Decimal]] | None = None, reference_error: str | None = None):
        self.uploaded = uploaded or {}      # currency -> date -> rate
        self.reference = reference or {}    # currency -> publication date -> rate
        self.reference_error = reference_error
        self._published = {c: sorted(days) for c, days in self.reference.items()}

    def get(self, currency: str, day: str) -> Quote | None:
        if currency in self.uploaded:
            rate = self.uploaded[currency].get(day)
            return Quote(rate, day, UPLOADED) if rate is not None else None
        days = self._published.get(currency)
        if not days:
            return None
        # last publication on or before the record's date, at most a week back
        earlier = [d for d in days if d <= day]
        if not earlier or date.fromisoformat(day) - date.fromisoformat(earlier[-1]) > timedelta(days=7):
            return None
        return Quote(self.reference[currency][earlier[-1]], earlier[-1], ECB)

    def sources(self) -> dict[str, str]:
        out = {c: UPLOADED for c in self.uploaded}
        out.update({c: ECB for c in self.reference if c not in out})
        return out


@lru_cache(maxsize=64)
def _ecb_range(start: str, end: str, symbols: str) -> dict[str, dict[str, str]]:
    """Public reference rates only, so caching them keeps nothing about the user."""
    r = httpx.get(f"{ECB_URL}/{start}..{end}", params={"base": "EUR", "symbols": symbols}, timeout=10)
    r.raise_for_status()
    return {d: {k: str(v) for k, v in row.items()} for d, row in r.json()["rates"].items()}


def reference_rates(currencies: set[str], first: str, last: str) -> dict[str, dict[str, Decimal]]:
    """ECB rates for these currencies from a week before `first` to `last`, in this module's directions."""
    if not currencies:
        return {}
    start = (date.fromisoformat(first) - timedelta(days=7)).isoformat()
    symbols = ",".join(sorted((currencies | {"USD"}) - {"EUR"}))
    table = _ecb_range(start, last, symbols)
    out: dict[str, dict[str, Decimal]] = {c: {} for c in currencies}
    for day, row in table.items():
        per_eur = {k: Decimal(v) for k, v in row.items()}
        usd = per_eur.get("USD")
        if not usd:
            continue
        for c in currencies:
            if c == "EUR":
                out[c][day] = usd
            elif c == "CNY" and "CNY" in per_eur:
                out[c][day] = per_eur["CNY"] / usd
            elif c in per_eur:
                out[c][day] = usd / per_eur[c]
    return {c: days for c, days in out.items() if days}


def resolve(uploaded: dict[str, dict[str, Decimal]], needed: dict[str, set[str]], *, fetch: bool = True) -> Rates:
    """Rates for every (currency, date) in `needed`; reference rates only for currencies with no rate file."""
    want = {c for c in needed if c not in uploaded and needed[c]}
    if not want or not fetch:
        return Rates(uploaded)
    days = sorted(d for c in want for d in needed[c])
    try:
        return Rates(uploaded, reference_rates(want, days[0], days[-1]))
    except (httpx.HTTPError, KeyError, ValueError):
        return Rates(uploaded, reference_error="Reference exchange rates could not be loaded right now.")

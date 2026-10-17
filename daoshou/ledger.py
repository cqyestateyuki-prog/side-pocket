"""Deterministic money math for v2: parse exports into one ledger, convert, break down.

Mirrors daoshou_testdata/tools/check_answers.py: each CNY record is converted at
its own date's rate (USD = CNY / rate), Upwork fees are rounded per row before
summing, withholding stays its own line, and amounts are only rounded to cents
(ROUND_HALF_UP) when they are reported.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache

from . import data

PLATFORMS = ["bilibili", "youtube", "twitch", "patreon", "upwork"]
LABEL = {"bilibili": "B站", "youtube": "YouTube", "twitch": "Twitch", "patreon": "Patreon", "upwork": "Upwork"}
ALIASES = {"b站": "bilibili", "b 站": "bilibili", "哔哩哔哩": "bilibili", **{p: p for p in PLATFORMS}}
CENT = Decimal("0.01")


class MissingFXRate(Exception):
    pass


def cents(x: Decimal) -> float:
    return float(x.quantize(CENT, rounding=ROUND_HALF_UP))


def D(value: str | float) -> Decimal:
    return Decimal(str(value).replace(",", "").strip() or "0")


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
    contract_id: str = ""
    ios: Decimal = Decimal(0)

    @property
    def month(self) -> str:
        return self.date[:7]


def _iso(raw: str, fmt: str) -> str:
    return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")


def _parse(platform: str, r: dict) -> Record:
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
                      D(r["Payout (USD)"]), ios=D(r["iOS Pledges (USD)"]))
    if platform == "upwork":
        amount = D(r["Amount (USD)"])
        if r["Type"] == "Withdrawal Fee":
            return Record(platform, _iso(r["Date"], "%b %d, %Y"), "Withdrawal Fee", "USD", Decimal(0), Decimal(0),
                          amount, Decimal(0), -amount)
        rate = D(r["Service Fee Rate"].rstrip("%")) / 100
        fee = (amount * rate).quantize(CENT, rounding=ROUND_HALF_UP)  # Upwork rounds each fee to the cent
        return Record(platform, _iso(r["Date"], "%b %d, %Y"), r["Type"], "USD", amount, fee, Decimal(0),
                      Decimal(0), amount - fee, contract_id=r["Contract ID"])
    raise ValueError(platform)


def records(creator: dict, platform: str, month: str | None = None) -> list[Record]:
    account = creator["accounts"].get(platform)
    if account is None:
        return []
    _, rows = data.export_rows(platform)
    col = data.EXPORTS[platform][1]
    out = [_parse(platform, r) for r in rows if r[col] == account]
    return [r for r in out if month is None or r.month == month]


def usd_rate(rec: Record) -> Decimal | None:
    """CNY per USD for this record's own date; None for USD records."""
    if rec.currency == "USD":
        return None
    rate = data.fx_rates().get(rec.date)
    if rate is None:
        raise MissingFXRate(rec.date)
    return D(rate)


def to_usd(rec: Record) -> dict[str, Decimal]:
    rate = usd_rate(rec)
    fields = ("gross", "platform_fee", "payment_fee", "withheld", "net")
    return {f: getattr(rec, f) if rate is None else getattr(rec, f) / rate for f in fields}


def platform_totals(creator: dict, platform: str, month: str) -> dict | None:
    recs = records(creator, platform, month)
    if not recs:
        return None
    missing = sorted({r.date for r in recs if r.currency == "CNY" and r.date not in data.fx_rates()})
    if missing:
        raise MissingFXRate(", ".join(missing))
    tot = {f: Decimal(0) for f in ("gross", "platform_fee", "payment_fee", "withheld", "net")}
    for r in recs:
        for f, v in to_usd(r).items():
            tot[f] += v
    out = {"usd": tot, "records": len(recs), "currency": recs[0].currency}
    if recs[0].currency == "CNY":
        out["native_cny"] = {"net": sum((r.net for r in recs), Decimal(0)),
                             "withheld": sum((r.withheld for r in recs), Decimal(0)),
                             "gross": sum((r.gross for r in recs), Decimal(0))}
    if platform == "patreon":
        out["ios"] = sum((r.ios for r in recs), Decimal(0))
    return out


def month_breakdown(creator: dict, month: str) -> dict:
    per = {p: t for p in PLATFORMS if (t := platform_totals(creator, p, month)) is not None}
    total = {f: sum((t["usd"][f] for t in per.values()), Decimal(0))
             for f in ("gross", "platform_fee", "payment_fee", "withheld", "net")}
    return {"platforms": per, "total": total}

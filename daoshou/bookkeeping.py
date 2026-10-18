"""Manual income and expenses next to the platform statements, and the events the rewards work from.

An entry is `{id, kind: "income" | "expense", date, amount, currency, source, category}`:
- income needs `source`, the person's own label ("Tutoring");
- an expense needs a `category` from CATEGORIES, and may have a `source` label ("Adobe").

Notes stay in the browser: any field not listed above is ignored and never echoed. Each entry is
checked on its own; a bad one is skipped and reported with its id and the reason, and the rest
still count. Entries become ledger Records (platform "manual") so they convert with exactly the
same exchange-rate rules as statements. Platform fees are already inside a statement's net, so
expenses are only what the person enters; nothing is counted twice.

The demo creators' entries live in daoshou_testdata/data/manual_entries.json (fictional, C01 only).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from functools import lru_cache

from . import data, ledger, rewards

CATEGORIES = ["Software & subscriptions", "Equipment", "Internet & phone", "Education", "Travel", "Marketing",
              "Other"]
FIELDS = ("id", "kind", "date", "amount", "currency", "source", "category")
MAX_ENTRIES = 2000
MAX_LABEL = 60
MAX_AMOUNT = Decimal(10_000_000)
FIXTURE = data.DATA / "manual_entries.json"


@dataclass
class Entry:
    id: str
    kind: str                 # "income" | "expense"
    source: str | None        # income: the label it is grouped by; expense: optional label
    category: str | None      # expense only
    record: ledger.Record     # platform "manual", gross = net = amount

    @property
    def label(self) -> str:
        return self.source if self.kind == "income" else self.category


class _Bad(Exception):
    pass


def _text(value, name: str, *, required: bool) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise _Bad(f"{name} is required")
        return None
    if not isinstance(value, str):
        raise _Bad(f"{name} must be text")
    value = " ".join(value.split())
    if len(value) > MAX_LABEL:
        raise _Bad(f"{name} is longer than {MAX_LABEL} characters")
    return value


def _amount(value) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise _Bad("amount must be a number")
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation:
        raise _Bad("amount must be a number") from None
    if not amount.is_finite() or amount <= 0:
        raise _Bad("amount must be more than 0")
    if amount > MAX_AMOUNT:
        raise _Bad("amount is too large")
    if amount.as_tuple().exponent < -2:
        raise _Bad("amount has more than 2 decimal places")
    return amount


def _day(value, today: date | None) -> str:
    try:
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError
        d = date.fromisoformat(value)
    except ValueError:
        raise _Bad("date must be YYYY-MM-DD") from None
    if d.year < 2000:
        raise _Bad("date is before 2000")
    if today and d > today:
        raise _Bad("date is in the future")
    return d.isoformat()


def _entry(raw, seen: set[str], today: date | None) -> Entry:
    if not isinstance(raw, dict):
        raise _Bad("an entry must be an object")
    eid = _text(raw.get("id"), "id", required=True)
    if eid in seen:
        raise _Bad("another entry has the same id")
    kind = raw.get("kind")
    if kind not in ("income", "expense"):
        raise _Bad('kind must be "income" or "expense"')
    day = _day(raw.get("date"), today)
    amount = _amount(raw.get("amount"))
    currency = raw.get("currency")
    if not isinstance(currency, str) or not _is_code(currency):
        raise _Bad("currency must be a 3-letter code such as USD or CNY")
    currency = currency.strip().upper()
    if kind == "income":
        source = _text(raw.get("source"), "source", required=True)
        if raw.get("category") not in (None, ""):
            raise _Bad("category is only for expenses")
        category = None
    else:
        source = _text(raw.get("source"), "source", required=False)
        wanted = _text(raw.get("category"), "category", required=True)
        category = next((c for c in CATEGORIES if c.lower() == wanted.lower()), None)
        if category is None:
            raise _Bad("category must be one of: " + ", ".join(CATEGORIES))
    rec = ledger.Record("manual", day, kind, currency, amount, Decimal(0), Decimal(0), Decimal(0), amount, ref=eid)
    return Entry(eid, kind, source, category, rec)


def _is_code(code: str) -> bool:
    code = code.strip()
    return len(code) == 3 and code.isalpha() and code.isascii()


def parse(raw: list, *, today: date | None = None) -> tuple[list[Entry], dict]:
    """(accepted entries, summary for `import.entries`). Never raises on bad input."""
    entries, rejected, ignored, seen = [], [], set(), set()
    if not isinstance(raw, list):
        raw = []
    for i, item in enumerate(raw[:MAX_ENTRIES]):
        if isinstance(item, dict):
            ignored |= {k for k in item if k not in FIELDS}
        try:
            e = _entry(item, seen, today)
        except _Bad as why:
            eid = item.get("id") if isinstance(item, dict) and isinstance(item.get("id"), str) else None
            rejected.append({"index": i, "id": eid[:64] if eid else None, "reason": str(why)})
            continue
        seen.add(e.id)
        entries.append(e)
    if len(raw) > MAX_ENTRIES:
        rejected.append({"index": MAX_ENTRIES, "id": None,
                         "reason": f"only the first {MAX_ENTRIES} entries are read"})
    entries.sort(key=lambda e: (e.record.date, e.id))
    summary = {"received": len(raw), "accepted": len(entries), "income": sum(e.kind == "income" for e in entries),
               "expenses": sum(e.kind == "expense" for e in entries), "rejected": rejected,
               "ignored_fields": sorted(ignored)}
    return entries, summary


# ---------------------------------------------------------------- the demo creators

@lru_cache
def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["creators"] if FIXTURE.exists() else {}


def demo(creator_id: str) -> tuple[list[Entry], dict | None]:
    spec = _fixture().get(creator_id) or {}
    entries, _ = parse(spec.get("entries", []))
    goal = spec.get("monthly_goal")
    return entries, ({"amount": ledger.D(goal["amount"]), "currency": goal["currency"]} if goal else None)


def entries_of(creator: dict) -> list[Entry]:
    """Uploaded data carries its own entries (maybe none); a demo creator gets the fixture's."""
    return creator["entries"] if "entries" in creator else demo(creator["creator_id"])[0]


def goal_of(creator: dict) -> dict | None:
    return creator.get("monthly_goal") if "entries" in creator else demo(creator["creator_id"])[1]


# ---------------------------------------------------------------- events for the rewards

def _net(rec: ledger.Record, currency: str) -> Decimal | None:
    try:
        return ledger.convert(rec, currency)["net"]
    except ledger.MissingFXRate:
        return None


def events(creator: dict) -> list[rewards.Event]:
    out = []
    for p in ledger.PLATFORMS:
        for rec in ledger.records(creator, p):
            out.append(rewards.Event(rec.date, "income", ledger.LABEL[p], p, rec.currency, rec.gross > 0,
                                     _net(rec, "USD"), _net(rec, "CNY")))
    for e in entries_of(creator):
        out.append(rewards.Event(e.record.date, e.kind, e.label, None, e.record.currency, True,
                                 _net(e.record, "USD"), _net(e.record, "CNY")))
    return sorted(out, key=lambda e: (e.date, e.source))

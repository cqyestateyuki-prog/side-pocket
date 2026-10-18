"""Statements a user uploads: recognise each file by its columns and parse it into ledger records.

Everything here works on text held in memory for one request. Nothing is written anywhere.

A file is recognised by its header row (the first 10 lines are searched, so a title line above the
header is fine; matching ignores case, spaces and a byte-order mark). Supported:
- the eight platform statement formats in ledger._parse;
- rate files: `date,cny_per_usd` (CNY per 1 USD) or `date` plus currency-code columns such as
  `date,EUR,GBP` (USD per 1 unit), the same directions as the bundled tables.
A row that can't be read is skipped and reported with its line number; nothing is guessed. A file
uploaded twice is only counted once.
"""
from __future__ import annotations

import base64
import binascii
import csv
import hashlib
import io
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from . import fx, ledger

HEADER_SCAN = 10
MAX_SKIPPED = 20  # skipped rows listed per file; the count is always complete

# What each statement looks like. `columns` are every column ledger._parse reads (all must be in the
# header for a file to be recognised); `account` is optional and only groups rows, so its values can be
# anything, such as the labels the browser puts there; every other column in a file is ignored.
# `date` is (column, strptime format) and must agree with ledger._parse (tests/test_statements.py).
FORMATS = {
    "bilibili": {"account": "账号ID", "date": ("日期", "%Y/%m/%d"), "currency": "CNY",
                 "columns": ["日期", "收入类型", "流水(元)", "平台分成(元)", "已代扣个税(元)", "实际到账(元)"],
                 "ref": None},
    "youtube": {"account": "Channel ID", "date": ("Date", "%Y-%m-%d"), "currency": "USD",
                "columns": ["Date", "Revenue Type", "Gross Revenue (USD)", "YouTube Share (USD)",
                            "US Tax Withheld (USD)", "Estimated Revenue (USD)"], "ref": None},
    "twitch": {"account": "Username", "date": ("Date", "%m/%d/%Y"), "currency": "USD",
               "columns": ["Date", "Revenue Type", "Gross (USD)", "Twitch Share (USD)", "Payout (USD)"], "ref": None},
    "patreon": {"account": "Creator", "date": ("Month", "%b %Y"), "currency": "USD",
                "columns": ["Month", "Patrons", "Gross Pledges (USD)", "iOS Pledges (USD)", "Patreon Fee (USD)",
                            "Payment Processing (USD)", "Payout (USD)"], "ref": None},
    "upwork": {"account": "Freelancer", "date": ("Date", "%b %d, %Y"), "currency": "USD",
               "columns": ["Date", "Type", "Contract ID", "Amount (USD)", "Service Fee Rate"], "ref": "Contract ID"},
    "fiverr": {"account": "Seller", "date": ("Completed At (UTC)", "%Y-%m-%dT%H:%M:%SZ"), "currency": "USD",
               "columns": ["Completed At (UTC)", "Order ID", "Item", "Amount (USD)"], "ref": "Order ID"},
    "freelancer": {"account": "username", "date": ("date", "%Y%m%d"), "currency_column": "currency",
                   "columns": ["date", "project_id", "currency", "project_amount", "entry_type"], "ref": "project_id"},
    "contra": {"account": "Profile", "date": ("Paid On", "%B %d, %Y"), "currency": "USD",
               "columns": ["Paid On", "Project", "Amount"], "ref": "Project"},
}
STATEMENTS = {p: (f["account"], f["columns"]) for p, f in FORMATS.items()}
CURRENCY = re.compile(r"^[A-Z]{3}$")


def _norm(name: str) -> str:
    return re.sub(r"\s+", "", name.replace("\ufeff", "").replace("（", "(").replace("）", ")")).lower()


@dataclass
class ParsedFile:
    name: str
    kind: str                       # statement | rates | unknown | duplicate | empty | unreadable
    platform: str | None = None
    accounts: list[str] = field(default_factory=list)
    records: list[tuple[str, ledger.Record]] = field(default_factory=list)  # (account, record)
    rates: dict[str, dict[str, Decimal]] = field(default_factory=dict)       # rate files only
    rows: int = 0
    skipped: list[dict] = field(default_factory=list)
    skipped_count: int = 0
    duplicate_of: str | None = None
    message: str | None = None

    def summary(self) -> dict:
        out = {"file": self.name, "kind": self.kind, "rows": self.rows, "skipped_rows": self.skipped_count,
               "skipped": self.skipped}
        if self.kind == "statement":
            dates = sorted(r.date for _, r in self.records)
            out.update({"platform": self.platform, "label": ledger.LABEL[self.platform], "accounts": self.accounts,
                        "records": len(self.records), "first_date": dates[0] if dates else None,
                        "last_date": dates[-1] if dates else None,
                        "months": sorted({r.month for _, r in self.records}),
                        "currencies": sorted({r.currency for _, r in self.records})})
        if self.kind == "rates":
            out["rates"] = {c: {"days": len(days), "first_date": min(days), "last_date": max(days),
                                "direction": "CNY per 1 USD" if c == "CNY" else f"USD per 1 {c}"}
                            for c, days in self.rates.items() if days}
        if self.duplicate_of:
            out["duplicate_of"] = self.duplicate_of
        if self.message:
            out["message"] = self.message
        return out


def formats() -> dict:
    """GET /api/personal/formats: how files are recognised, so the browser can find the account column
    and relabel it before anything is uploaded. Static; holds no user data."""
    return {
        "matching": {"header_scan_lines": HEADER_SCAN,
                     "rule": "A file is a platform's statement when its header row (one of the first "
                             f"{HEADER_SCAN} lines) contains every column in `columns`.",
                     "normalise": ["drop a byte-order mark (U+FEFF)", "full-width brackets （） become ()",
                                   "remove all whitespace", "lowercase"]},
        "statements": [{"platform": p, "label": ledger.LABEL[p], "account_column": f["account"],
                        "columns": f["columns"], "date_column": f["date"][0], "date_format": f["date"][1],
                        "currency": f.get("currency"), "currency_column": f.get("currency_column"),
                        "ref_column": f["ref"]} for p, f in FORMATS.items()],
        "rate_files": [{"columns": ["date", "cny_per_usd"], "direction": "CNY per 1 USD", "date_format": "%Y-%m-%d"},
                       {"columns": ["date", "<ISO currency code>, …"], "example": ["date", "EUR", "GBP"],
                        "direction": "USD per 1 unit", "date_format": "%Y-%m-%d"}],
    }


def decode(content: str | None, content_base64: str | None) -> str:
    """Text as sent, or bytes as UTF-8 and failing that GB18030 (what Excel in China usually saves)."""
    if content is not None:
        return content
    try:
        raw = base64.b64decode(content_base64 or "", validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("content_base64 is not valid base64") from None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("the file is not UTF-8 or GB18030 text")


def _detect(header: list[str]) -> tuple[str, str | None] | None:
    names = {_norm(h) for h in header}
    for platform, (account, columns) in STATEMENTS.items():
        if {_norm(c) for c in columns} <= names:
            return "statement", platform
    if "date" in names and "cny_per_usd" in names:
        return "rates", "cny_per_usd"
    if "date" in names and any(CURRENCY.match(h.strip()) for h in header):
        return "rates", "usd_per_unit"
    return None


def _rows(text: str) -> tuple[list[str], list[list[str]], int] | None:
    """(header, data rows, line number of the header) for the first header row we recognise."""
    lines = list(csv.reader(io.StringIO(text.replace("\ufeff", ""))))
    for i, row in enumerate(lines[:HEADER_SCAN]):
        if _detect(row):
            return row, lines[i + 1:], i + 1
    return None


def _canonical(header: list[str], platform: str) -> list[str]:
    """Map the file's spelling of each column to the name ledger._parse expects."""
    account, columns = STATEMENTS[platform]
    wanted = {_norm(c): c for c in [account, *columns]}
    return [wanted.get(_norm(h), h.strip()) for h in header]


def _skip(pf: ParsedFile, line: int, reason: str) -> None:
    pf.skipped_count += 1
    if len(pf.skipped) < MAX_SKIPPED:
        pf.skipped.append({"line": line, "reason": reason})


def _parse_statement(pf: ParsedFile, header: list[str], rows: list[list[str]], first_line: int) -> None:
    names = _canonical(header, pf.platform)
    account_col = STATEMENTS[pf.platform][0]
    has_account = _norm(account_col) in {_norm(h) for h in header}
    for offset, values in enumerate(rows, start=1):
        line = first_line + offset
        if not any(v.strip() for v in values):
            continue
        pf.rows += 1
        row = dict(zip(names, values))
        try:
            rec = ledger._parse(pf.platform, row)
        except KeyError as e:
            _skip(pf, line, f"missing a value for {e.args[0]}")
            continue
        except (ValueError, InvalidOperation, ArithmeticError):
            _skip(pf, line, "a date or amount on this row isn't in the statement's usual format")
            continue
        account = (row.get(account_col) or "").strip() if has_account else ""
        pf.records.append((account, rec))
        if account not in pf.accounts:
            pf.accounts.append(account)


def _parse_rates(pf: ParsedFile, header: list[str], rows: list[list[str]], first_line: int, layout: str) -> None:
    cols = {_norm(h): i for i, h in enumerate(header)}
    if layout == "cny_per_usd":
        currencies = {"CNY": cols["cny_per_usd"]}
    else:
        currencies = {h.strip(): i for i, h in enumerate(header) if CURRENCY.match(h.strip())}
    pf.rates = {c: {} for c in currencies}
    for offset, values in enumerate(rows, start=1):
        line = first_line + offset
        if not any(v.strip() for v in values):
            continue
        pf.rows += 1
        try:
            day = ledger._iso(values[cols["date"]], "%Y-%m-%d")
            for c, i in currencies.items():
                if i < len(values) and values[i].strip():
                    rate = Decimal(values[i].strip())
                    if rate <= 0:
                        raise ValueError
                    pf.rates[c][day] = rate
        except (IndexError, ValueError, InvalidOperation):
            _skip(pf, line, "expected a YYYY-MM-DD date and positive rates")


def parse_file(name: str, text: str) -> ParsedFile:
    pf = ParsedFile(name=name, kind="unknown")
    if not text.strip():
        pf.kind, pf.message = "empty", "The file is empty."
        return pf
    found = _rows(text)
    if found is None:
        pf.message = ("These columns don't match a statement Side Atlas can read yet. Supported: "
                      + ", ".join(ledger.LABEL[p] for p in STATEMENTS) + ", and exchange-rate files.")
        return pf
    header, rows, header_line = found
    kind, what = _detect(header)
    if kind == "statement":
        pf.kind, pf.platform = "statement", what
        _parse_statement(pf, header, rows, header_line)
        if not pf.records:
            pf.message = "No rows could be read from this statement."
    else:
        pf.kind = "rates"
        _parse_rates(pf, header, rows, header_line, what)
    return pf


@dataclass
class Upload:
    """Every file in one request, parsed, with rates resolved for the records that need them."""
    files: list[ParsedFile]
    rates: fx.Rates
    entries: dict | None = None     # bookkeeping.parse's summary of the manual entries, if any were sent

    def statements(self) -> list[ParsedFile]:
        return [f for f in self.files if f.kind == "statement"]

    def records(self) -> dict[str, list[ledger.Record]]:
        out: dict[str, list[ledger.Record]] = {}
        for f in self.statements():
            out.setdefault(f.platform, []).extend(r for _, r in f.records)
        for recs in out.values():
            recs.sort(key=lambda r: r.date)
        return out

    def accounts(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for f in self.statements():
            for a in f.accounts:
                if a not in out.setdefault(f.platform, []):
                    out[f.platform].append(a)
        return out

    def months(self) -> list[str]:
        return sorted({r.month for f in self.statements() for _, r in f.records})

    def overlaps(self) -> list[dict]:
        """Two different files with the same platform and account covering some of the same dates."""
        out, seen = [], {}
        for f in self.statements():
            for account in f.accounts:
                dates = {r.date for a, r in f.records if a == account}
                for other, other_dates in seen.get((f.platform, account), []):
                    if dates & other_dates:
                        out.append({"platform": ledger.LABEL[f.platform], "files": [other, f.name],
                                    "first_shared_date": min(dates & other_dates),
                                    "message": "Two files cover some of the same dates for one account. If they "
                                               "are the same statement, remove one so income isn't counted twice."})
                seen.setdefault((f.platform, account), []).append((f.name, dates))
        return out

    def summary(self) -> dict:
        statements = self.statements()
        return {"files": [f.summary() for f in self.files],
                "platforms": [{"platform": p, "label": ledger.LABEL[p], "accounts": accts}
                              for p, accts in self.accounts().items()],
                "months": self.months(), "records": sum(len(f.records) for f in statements),
                "rate_sources": self.rates.sources(), "rates_note": self.rates.reference_error,
                "overlaps": self.overlaps(),
                "entries": self.entries or {"received": 0, "accepted": 0, "income": 0, "expenses": 0, "rejected": [],
                                            "ignored_fields": []}}


def read(files: list[tuple[str, str]], *, currency: str = "USD", reference_rates: bool = True,
         extra: list[ledger.Record] = (), cny_everywhere: bool = False) -> Upload:
    """Parse (name, text) pairs, drop exact duplicates, and attach rates to every record, and to
    `extra` records (manual entries) as well.

    Rates are looked up for each non-USD record's date, and for every record's date when amounts
    are to be shown in CNY (or a CNY goal needs them: `cny_everywhere`)."""
    parsed, digests = [], {}
    for name, text in files:
        digest = hashlib.sha256(text.replace("\r\n", "\n").strip().encode()).hexdigest()
        if digest in digests:
            parsed.append(ParsedFile(name=name, kind="duplicate", duplicate_of=digests[digest],
                                     message="Same content as another file; counted once."))
            continue
        digests[digest] = name
        parsed.append(parse_file(name, text))
    uploaded: dict[str, dict[str, Decimal]] = {}
    for f in parsed:
        for c, days in f.rates.items():
            uploaded.setdefault(c, {}).update(days)
    every = [r for f in parsed for _, r in f.records] + list(extra)
    needed: dict[str, set[str]] = {}
    for r in every:
        if r.currency != "USD":
            needed.setdefault(r.currency, set()).add(r.date)
        if currency == "CNY" or cny_everywhere:
            needed.setdefault("CNY", set()).add(r.date)
    rates = fx.resolve(uploaded, needed, fetch=reference_rates)
    for r in every:
        r.rates = rates
    return Upload(parsed, rates)


def profile(upload: Upload, *, tax_home: str, set_aside_rate: float, payout_methods: dict[str, str],
            entries: list | None = None, monthly_goal: dict | None = None) -> dict:
    """A creator dict in the shape the ledger and the API expect, built from the upload (plus the
    manual entries and goal, see daoshou/bookkeeping.py)."""
    accounts = upload.accounts()
    return {"creator_id": "you", "name": "You", "profile": None, "tax_country": tax_home,
            "set_aside_rate": set_aside_rate, "active_months": upload.months(),
            "accounts": {p: ", ".join(a for a in accts if a) or ledger.LABEL[p] for p, accts in accounts.items()},
            "account_list": accounts,
            "payout_methods": {p: m for p, m in payout_methods.items() if p in accounts},
            "records": upload.records(), "entries": entries or [], "monthly_goal": monthly_goal}

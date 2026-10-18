"""Manual income and expenses: checking entries, the personal pipeline, and the demo fixture for C01."""
from __future__ import annotations

from datetime import date

import pytest

from conftest import RATE_FILES, request_for, statement_files
from daoshou import bookkeeping

TODAY = date(2026, 10, 17)
GOOD = [
    {"id": "i1", "kind": "income", "date": "2026-09-14", "amount": 900, "currency": "CNY", "source": "Tutoring",
     "note": "paid on WeChat, Tuesday class"},
    {"id": "i2", "kind": "income", "date": "2026-09-21", "amount": "480.00", "currency": "eur",
     "source": "Logo commission"},
    {"id": "e1", "kind": "expense", "date": "2026-09-02", "amount": 59.99, "currency": "USD",
     "source": "Adobe Creative Cloud", "category": "software & subscriptions"},
    {"id": "e2", "kind": "expense", "date": "2026-09-10", "amount": 129, "currency": "USD",
     "category": "Education"},
]


def test_good_entries_are_read():
    entries, summary = bookkeeping.parse(GOOD, today=TODAY)
    assert [e.id for e in entries] == ["e1", "e2", "i1", "i2"]  # by date
    assert summary == {"received": 4, "accepted": 4, "income": 2, "expenses": 2, "rejected": [],
                       "ignored_fields": ["note"]}
    assert entries[0].category == "Software & subscriptions" and entries[3].record.currency == "EUR"
    assert str(entries[3].record.gross) == "480.00"


@pytest.mark.parametrize("change, reason", [
    ({"kind": "gift"}, 'kind must be "income" or "expense"'),
    ({"date": "14/09/2026"}, "date must be YYYY-MM-DD"),
    ({"date": "2026-02-30"}, "date must be YYYY-MM-DD"),
    ({"date": "2026-10-18"}, "date is in the future"),
    ({"amount": 0}, "amount must be more than 0"),
    ({"amount": -5}, "amount must be more than 0"),
    ({"amount": True}, "amount must be a number"),
    ({"amount": "12,00"}, "amount must be a number"),
    ({"amount": "NaN"}, "amount must be more than 0"),
    ({"amount": 1.234}, "amount has more than 2 decimal places"),
    ({"amount": 10_000_001}, "amount is too large"),
    ({"currency": "US$"}, "currency must be a 3-letter code such as USD or CNY"),
    ({"source": "  "}, "source is required"),
    ({"source": "x" * 61}, "source is longer than 60 characters"),
    ({"category": "Travel"}, "category is only for expenses"),
    ({"id": None}, "id is required"),
])
def test_bad_income_entries_are_rejected_one_by_one(change, reason):
    entries, summary = bookkeeping.parse([{**GOOD[0], **change}, GOOD[1]], today=TODAY)
    assert [e.id for e in entries] == ["i2"]
    assert summary["rejected"][0]["reason"] == reason and summary["rejected"][0]["index"] == 0


def test_bad_expenses_duplicates_and_junk():
    raw = [{**GOOD[2], "category": "Snacks"}, {**GOOD[3], "category": None}, GOOD[0], {**GOOD[1], "id": "i1"},
           "not an entry", None, [1, 2]]
    entries, summary = bookkeeping.parse(raw, today=TODAY)
    assert [e.id for e in entries] == ["i1"]
    reasons = [r["reason"] for r in summary["rejected"]]
    assert reasons[0].startswith("category must be one of: Software & subscriptions, Equipment")
    assert reasons[1:] == ["category is required", "another entry has the same id", "an entry must be an object",
                           "an entry must be an object", "an entry must be an object"]


# ---------------------------------------------------------------- the personal pipeline

def _with(entries, **extra):
    return {**request_for("C01", **extra), "entries": entries}


def test_entries_add_fields_and_change_nothing_else(client):
    plain = client.post("/api/personal/overview", json=request_for("C01", month="2026-09")).json()
    mine = client.post("/api/personal/overview", json=_with(GOOD, month="2026-09")).json()
    for key in ("totals", "platforms", "best_keep_rate", "month_over_month", "set_aside", "issues", "complete"):
        assert mine[key] == plain[key], key
    kept = mine["kept_after_expenses"]
    manual = [r for r in mine["income_by_source"] if r["manual"]]
    assert {r["source"] for r in manual} == {"Tutoring", "Logo commission"}
    assert kept["platform_net"] == plain["totals"]["net"] == 5341.79
    assert kept["kept"] == round(kept["platform_net"] + kept["manual_income"] - kept["expenses"], 2)
    assert kept["expenses"] == 188.99 and mine["expenses"]["entries"] == 2
    assert [(c["category"], c["amount"]) for c in mine["expenses_by_category"]] == [
        ("Software & subscriptions", 59.99), ("Education", 129.0)]
    assert mine["import"]["entries"]["accepted"] == 4
    assert "paid on WeChat" not in str(mine)  # notes are never echoed


def test_entry_rows_carry_their_rates(client):
    body = client.post("/api/personal/ledger", json=_with(GOOD, month="2026-09")).json()
    rows = {r["id"]: r for r in body["entry_rows"]}
    assert rows["i1"]["fx"] == {"currency": "CNY", "rate": 7.1651, "rate_date": "2026-09-14",
                                "rule": "CNY per 1 USD (USD = CNY / rate)", "source": "your rate file"}
    assert rows["i1"]["amount_usd"] == round(900 / 7.1651, 2) and rows["i1"]["manual"] is True
    assert rows["e1"]["fx"] is None and rows["e1"]["amount_usd"] == 59.99 and rows["e1"]["kind"] == "expense"
    assert body["rows"] == client.post("/api/personal/ledger", json=request_for("C01", month="2026-09")).json()["rows"]


def test_an_entry_without_a_rate_is_an_issue_not_a_guess(client):
    missing = {"id": "i9", "kind": "income", "date": "2026-08-21", "amount": 100, "currency": "EUR",
               "source": "Logo commission"}  # the demo EUR file has no rate for this day
    body = client.post("/api/personal/overview", json=_with([missing, GOOD[0]], month="2026-08")).json()
    assert body["complete"] is False
    issue = next(i for i in body["issues"] if i.get("entry"))
    assert issue["entry"]["id"] == "i9" and issue["reason"] == "not_in_rate_file" and issue["platform"] is None
    assert body["manual_income"]["total"] == 0  # i1 is September; i9 is left out


def test_manual_entries_alone_are_enough(client):
    body = client.post("/api/personal/overview", json={"entries": GOOD, "month": "2026-09",
                                                       "files": [{"name": f, "content": (bookkeeping.data.DATA / f)
                                                                  .read_text(encoding="utf-8")} for f in RATE_FILES]}
                       ).json()
    assert body["totals"]["net"] == 0 and body["manual_income"]["entries"] == 2
    assert body["kept_after_expenses"]["kept"] == round(body["manual_income"]["total"] - 188.99, 2)


def test_rejected_entries_are_listed_and_the_rest_still_counts(client):
    body = client.post("/api/personal/detect", json={"files": statement_files("C01", rates=False),
                                                     "entries": [GOOD[0], {"id": "bad", "kind": "income"}]}).json()
    entries = body["import"]["entries"]
    assert entries["accepted"] == 1 and entries["rejected"][0]["id"] == "bad"


def test_goal_and_badges_on_personal_data(client):
    req = _with(GOOD, month="2026-09", monthly_goal={"amount": 40000, "currency": "CNY"})
    body = client.post("/api/personal/overview", json=req).json()
    goal = body["goal"]
    assert goal["currency"] == "CNY" and goal["amount"] == 40000.0 and goal["months"][0]["month"] == "2026-09"
    assert goal["months"][0]["complete"] is True and 0 < goal["months"][0]["progress"] < 2
    assert {b["id"] for b in body["badges"]} == {"first_1k_month", "best_month", "growth_streak_3", "new_source",
                                                 "five_sources", "new_currency", "total_10k", "complete_month"}
    assert body["settings"]["monthly_goal"] == {"amount": 40000.0, "currency": "CNY"}
    assert client.post("/api/personal/overview", json=_with(GOOD, month="2026-09")).json()["goal"] is None


def test_formats_list_the_entry_rules(client):
    entries = client.get("/api/personal/formats").json()["entries"]
    assert entries["expense_categories"] == bookkeeping.CATEGORIES and "note" not in entries["fields"]


# ---------------------------------------------------------------- the demo (fixture for C01 only)

def test_demo_c01_bookkeeping(client):
    kept = {}
    for m in ("2026-07", "2026-08", "2026-09"):
        o = client.get("/api/overview", params={"creator": "C01", "month": m}).json()
        kept[m] = o["kept_after_expenses"]
        assert o["complete"] and o["goal"]["amount"] == 6000.0
    assert {m: (k["platform_net"], k["manual_income"], k["expenses"], k["kept"]) for m, k in kept.items()} == {
        "2026-07": (5725.98, 167.66, 75.99, 5817.65),
        "2026-08": (4842.39, 831.0, 354.99, 5318.39),
        "2026-09": (5341.79, 776.54, 204.99, 5913.34)}
    sep = client.get("/api/overview", params={"creator": "C01", "month": "2026-09"}).json()
    assert sep["goal"]["months"][0]["reached_on"] == "2026-09-28"
    earned = {b["id"]: b["earned_on"] for b in sep["badges"] if b["earned"]}
    assert earned == {"first_1k_month": "2026-07-04", "best_month": "2026-09-28", "new_source": "2026-08-12",
                      "five_sources": "2026-07-04", "new_currency": "2026-08-12", "total_10k": "2026-08-21",
                      "complete_month": "2026-07-31"}
    rows = client.get("/api/ledger", params={"creator": "C01", "month": "2026-08"}).json()["entry_rows"]
    assert all(r["fx"]["source"] == "demo table" for r in rows if r["fx"])


def test_other_demo_creators_have_no_entries(client):
    o = client.get("/api/overview", params={"creator": "C11", "month": "2026-09"}).json()
    assert o["goal"] is None and o["manual_income"]["total"] == 0 and o["expenses"]["total"] == 0
    assert o["kept_after_expenses"]["kept"] == o["totals"]["net"]

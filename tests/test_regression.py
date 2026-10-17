"""Uploading a creator's own statements gives the same numbers as the bundled demo, and both match
the independently computed ground truth (daoshou_testdata/data/ground_truth_breakdown.csv).

The ground truth file adds Upwork fees before rounding while the ledger rounds each fee to the cent
(assumptions.json), so C01's September Upwork figures differ by a cent; the comparison allows the
question set's own tolerance of 0.01."""
from __future__ import annotations

import csv
import subprocess
import sys

import pytest

from conftest import ROOT, request_for, statement_files
from daoshou import data, ledger, statements

GROUND_TRUTH = data.DATA / "ground_truth_breakdown.csv"
FIELDS = {"gross_usd": "gross", "platform_fee_usd": "platform_fee", "payment_fee_usd": "payment_fee",
          "withheld_usd": "withheld", "net_usd": "net"}
CREATORS = sorted(data.creators())
MONTHS = ["2026-07", "2026-08", "2026-09"]


def _ground_truth() -> dict:
    with open(GROUND_TRUTH, encoding="utf-8-sig", newline="") as f:
        out: dict = {}
        for r in csv.DictReader(f):
            out.setdefault((r["creator_id"], r["month"]), []).append(r)
        return out


def _uploaded(creator_id: str) -> dict:
    files = [(f["name"], f["content"]) for f in statement_files(creator_id)]
    upload = statements.read(files, reference_rates=False)
    return statements.profile(upload, tax_home="US", set_aside_rate=0.25, payout_methods={})


@pytest.mark.parametrize("source", ["demo", "upload"])
def test_breakdown_matches_ground_truth(source):
    for (cid, month), rows in _ground_truth().items():
        c = data.creators()[cid] if source == "demo" else _uploaded(cid)
        if any(r["platform"] == "ALL" for r in rows):  # a missing rate: no totals, never an estimate
            with pytest.raises(ledger.MissingFXRate):
                ledger.month_breakdown(c, month)
            continue
        b = ledger.month_breakdown(c, month)
        for r in rows:
            got = b["total"] if r["platform"] == "TOTAL" else b["platforms"][r["platform"]]["usd"]
            for col, f in FIELDS.items():
                assert abs(ledger.cents(got[f]) - float(r[col])) < 0.0101, (cid, month, r["platform"], col)


def _plain(items: list[dict], *keys: str) -> list[dict]:
    """Drop what only uploads add: where a rate came from, why one is missing (and the sentence saying so)."""
    return [{k: v for k, v in i.items() if k not in keys} for i in items]


@pytest.mark.parametrize("cid", CREATORS)
@pytest.mark.parametrize("month", MONTHS)
def test_personal_overview_matches_demo(client, cid, month):
    demo = client.get("/api/overview", params={"creator": cid, "month": month}).json()
    mine = client.post("/api/personal/overview", json=request_for(cid, month=month)).json()
    for key in ("totals", "platforms", "best_keep_rate", "month_over_month", "set_aside", "complete"):
        assert mine[key] == demo[key], key
    assert _plain(mine["issues"], "reason", "message") == _plain(demo["issues"], "message")
    assert all(i["reason"] == "not_in_rate_file" for i in mine["issues"])


def _strip_sources(rows: list[dict]) -> list[dict]:
    return [{**r, "fx": {k: v for k, v in r["fx"].items() if k != "source"} if r["fx"] else None} for r in rows]


def test_c01_september_ledger(client):
    demo = client.get("/api/ledger", params={"creator": "C01", "month": "2026-09"}).json()
    mine = client.post("/api/personal/ledger", json=request_for("C01", month="2026-09")).json()
    assert _strip_sources(mine["rows"]) == demo["rows"]
    assert mine["totals"] == demo["totals"] and mine["waterfall"] == demo["waterfall"]
    assert {r["fx"]["source"] for r in mine["rows"] if r["fx"]} == {"your rate file"}


def test_c01_q3_tax_items_and_forms(client):
    q = {"creator": "C01", "period": "2026-Q3", "after": "2026-09-01"}
    demo = client.get("/api/tax-items", params=q).json()
    mine = client.post("/api/personal/tax-items", json=request_for("C01", period="2026-Q3", after="2026-09-01")).json()
    for key in demo:
        if key in ("creator", "set_aside"):
            continue
        assert mine[key] == demo[key], key
    assert mine["set_aside"]["amount"] == demo["set_aside"]["amount"]
    assert mine["next_us_estimated_tax_due"]["due_date"] == "2026-09-15"
    assert mine["forms"]["possible_duplicate_reports"] == ["Fiverr"]  # paid out to PayPal

    demo_forms = client.get("/api/forms", params={"creator": "C01", "period": "2026-Q3"}).json()
    mine_forms = client.post("/api/personal/forms", json=request_for("C01", period="2026-Q3")).json()
    assert {k: v for k, v in mine_forms.items() if k not in ("creator", "import", "settings")} == \
           {k: v for k, v in demo_forms.items() if k != "creator"}


def test_c01_q3_report(client):
    q = {"creator": "C01", "period": "2026-Q3", "after": "2026-09-01"}
    demo = client.get("/api/report", params=q).json()
    mine = client.post("/api/personal/report", json=request_for("C01", period="2026-Q3", after="2026-09-01")).json()
    for key in ("totals", "waterfall", "by_month", "by_platform", "best_keep_rate", "complete", "issues"):
        assert mine[key] == demo[key], key
    assert _plain(mine["fx_used"], "source") == demo["fx_used"]
    assert {u["source"] for u in mine["fx_used"]} == {"your rate file"}


def test_c11_august_missing_rate_is_reported_not_estimated(client):
    demo = client.get("/api/overview", params={"creator": "C11", "month": "2026-08"}).json()
    mine = client.post("/api/personal/overview", json=request_for("C11", month="2026-08")).json()
    assert mine["complete"] is False and demo["complete"] is False
    assert _plain(mine["issues"], "reason", "message") == _plain(demo["issues"], "message")
    assert [(i["currency"], i["date"], i["reason"]) for i in mine["issues"]] == [("EUR", "2026-08-21",
                                                                                  "not_in_rate_file")]
    assert mine["totals"] == demo["totals"]


def test_check_answers_still_89_of_89():
    out = subprocess.run([sys.executable, str(ROOT / "daoshou_testdata/tools/check_answers.py")],
                         capture_output=True, text=True, check=True).stdout
    assert "questions checked: 89, match: 89, mismatch: 0" in out

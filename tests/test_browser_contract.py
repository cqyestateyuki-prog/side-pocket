"""The contract with the browser: /formats, account labels set before upload, and rate details per record."""
from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime, timedelta

import pytest

from conftest import RATE_FILES, request_for
from daoshou import agent_personal, data, fx, ledger, statements


def _relabel(text: str, fmt: dict, label: str, keep_only_used: bool = False) -> str:
    """What the browser does: replace the account column's values (and optionally drop unused columns)."""
    rows = list(csv.DictReader(io.StringIO(text)))
    cols = [fmt["account_column"], *fmt["columns"]] if keep_only_used else list(rows[0])
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    w.writerows({**r, fmt["account_column"]: label} for r in rows)
    return out.getvalue()


@pytest.fixture(scope="module")
def formats(client):
    r = client.get("/api/personal/formats")
    assert r.status_code == 200 and r.headers["cache-control"].startswith("no-store")
    return {f["platform"]: f for f in r.json()["statements"]}


def test_formats_cover_every_platform_and_agree_with_the_parser(formats):
    assert set(formats) == set(ledger.PLATFORMS)
    for p, f in formats.items():
        _, rows = data.export_rows(p)
        rec = ledger._parse(p, rows[0])
        parsed = datetime.strptime(rows[0][f["date_column"]], f["date_format"]).strftime("%Y-%m-%d")
        assert parsed == rec.date, p
        assert (f["currency"] or rows[0][f["currency_column"]]) == rec.currency, p
        assert f["account_column"] == data.EXPORTS[p][1]


@pytest.mark.parametrize("keep_only_used", [False, True])
def test_relabelled_files_give_the_same_numbers(client, formats, keep_only_used):
    c = data.find_creator("C01")
    original = request_for("C01", month="2026-09")
    labelled = {**original, "files": [
        {"name": data.EXPORTS[p][0],
         "content": _relabel(data.export_csv(p, a), formats[p], f"acct-{4821 + i}", keep_only_used)}
        for i, (p, a) in enumerate(c["accounts"].items())] + original["files"][len(c["accounts"]):]}
    sent = "".join(f["content"] for f in labelled["files"])
    assert not any(a in sent for a in c["accounts"].values())
    a = client.post("/api/personal/overview", json=original).json()
    b = client.post("/api/personal/overview", json=labelled).json()
    assert b["totals"] == a["totals"] and b["platforms"] == a["platforms"] and b["complete"]
    assert {p["account"] for p in b["creator"]["platforms"]} == {f"acct-{4821 + i}" for i in range(len(c["accounts"]))}


def test_server_pseudonyms_are_four_digits_and_fresh_per_request():
    accounts = {"youtube": [f"acct-{n}" for n in range(4800, 4830)], "upwork": ["acct-4821"]}
    a = agent_personal.pseudonyms(accounts, b"one")
    b = agent_personal.pseudonyms(accounts, b"two")
    assert all(re.fullmatch(r"acct-\d{4}", v) for v in a.values())
    assert len(set(a.values())) == len(a)  # a clash moves to the next free code
    assert a != b


# ---------------------------------------------------------------- rates on every converted record

ECB = {"2026-08-28": {"CNY": "7.8251", "USD": "1.1643"}, "2026-08-31": {"CNY": "7.7922", "USD": "1.1596"}}


def _no_rate_files(**extra) -> dict:
    req = request_for("C01", **extra)
    return {**req, "files": [f for f in req["files"] if f["name"] not in RATE_FILES]}


def test_every_converted_record_says_rate_date_and_source(client, monkeypatch):
    days = (date(2026, 7, 1) + timedelta(days=i) for i in range(100))
    table = {d.isoformat(): {"CNY": "7.80", "USD": "1.16"} for d in days if d.weekday() < 5}  # working days
    monkeypatch.setattr(fx, "_ecb_range", lambda start, end, symbols: table)
    for currency, key in (("USD", "fx"), ("CNY", "fx_cny")):
        body = client.post("/api/personal/ledger", json=_no_rate_files(month="2026-08", currency=currency)).json()
        assert body["complete"]
        converted = [r[key] for r in body["rows"] if r[key]]
        assert converted and all({"rate", "rate_date", "source"} <= set(s) for s in converted)
        assert {s["source"] for s in converted} == {fx.ECB}
        weekend = [r for r in body["rows"] if r[key] and r[key]["rate_date"] != r["date"]]
        assert weekend and all(datetime.fromisoformat(r["date"]).weekday() >= 5 for r in weekend)
    report = client.post("/api/personal/report", json=_no_rate_files(period="2026-08")).json()
    assert report["fx_used"] and all(u["source"] == fx.ECB for u in report["fx_used"])


@pytest.mark.parametrize("ecb", ["down", "junk"])
def test_ecb_failure_is_a_clear_issue_not_a_crash(client, monkeypatch, ecb):
    if ecb == "down":
        def down(*_a):
            raise fx.httpx.ConnectTimeout("timed out")
        monkeypatch.setattr(fx, "_ecb_range", down)
    else:
        monkeypatch.setattr(fx, "_ecb_range", lambda *_a: {"2026-09-01": {"CNY": "not a number", "USD": "1.1"}})
    r = client.post("/api/personal/overview", json=_no_rate_files(month="2026-09"))
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is False and body["issues"]
    assert {i["reason"] for i in body["issues"]} == {"reference_rates_unavailable"}
    assert "couldn't be loaded" in body["issues"][0]["message"] and body["import"]["rates_note"]
    assert all(p["platform"] != "bilibili" for p in body["platforms"])  # nothing estimated


def test_reference_rates_off_means_rate_files_only(client):
    body = client.post("/api/personal/overview", json=_no_rate_files(month="2026-09", reference_rates=False)).json()
    assert {i["reason"] for i in body["issues"]} == {"reference_rates_off"}

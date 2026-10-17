"""Reading uploaded files: detection, bad rows, duplicates, encodings, rates and CNY amounts."""
from __future__ import annotations

import base64
from decimal import Decimal

import pytest

from conftest import request_for, statement_files
from daoshou import data, fx, ledger, statements


def _read(files, **kw):
    return statements.read([(f["name"], f["content"]) for f in files], **kw)


@pytest.mark.parametrize("platform", ledger.PLATFORMS)
def test_every_platform_export_is_recognised(platform):
    header, rows = data.export_rows(platform)
    account = rows[0][data.EXPORTS[platform][1]]
    pf = statements.parse_file("anything.csv", data.export_csv(platform, account))
    assert (pf.kind, pf.platform, pf.accounts) == ("statement", platform, [account])
    assert pf.skipped_count == 0 and len(pf.records) == pf.rows > 0


def test_header_found_below_a_title_line_and_with_loose_spelling():
    text = data.export_csv("bilibili", "bili_330121")
    header, body = text.split("\n", 1)
    loose = header.replace("(", "（").replace(")", "）").replace("日期", " 日期 ")
    pf = statements.parse_file("b.csv", "B站收入明细 2026\n" + loose + "\n" + body)
    assert pf.kind == "statement" and pf.platform == "bilibili" and pf.skipped_count == 0
    assert len(pf.records) == len(statements.parse_file("b.csv", text).records)


def test_gb18030_statement_sent_as_bytes():
    text = data.export_csv("bilibili", "bili_330121")
    encoded = base64.b64encode(text.encode("gb18030")).decode()
    assert statements.decode(None, encoded) == text


def test_bad_rows_are_skipped_with_their_line_number():
    text = data.export_csv("youtube", "UC-yzl-moonspirit").splitlines()
    text[2] = text[2].replace("2026-07-11", "11th July")
    pf = statements.parse_file("yt.csv", "\n".join(text))
    assert pf.skipped_count == 1 and pf.skipped[0]["line"] == 3
    assert len(pf.records) == pf.rows - 1


def test_unknown_empty_and_duplicate_files():
    yt = {"name": "yt.csv", "content": data.export_csv("youtube", "UC-yzl-moonspirit")}
    upload = _read([yt, {**yt, "name": "copy of yt.csv"}, {"name": "notes.csv", "content": "a,b\n1,2\n"},
                    {"name": "blank.csv", "content": "  "}])
    kinds = [f.kind for f in upload.files]
    assert kinds == ["statement", "duplicate", "unknown", "empty"]
    assert upload.files[1].duplicate_of == "yt.csv"
    assert upload.summary()["records"] == len(upload.files[0].records)


def test_overlapping_statements_are_flagged():
    text = data.export_csv("twitch", "yuezhiling_tv")
    lines = text.splitlines()
    first, second = "\n".join(lines[:8]), "\n".join([lines[0], *lines[5:]])
    upload = _read([{"name": "jul-aug.csv", "content": first}, {"name": "aug-sep.csv", "content": second}])
    assert [o["files"] for o in upload.overlaps()] == [["jul-aug.csv", "aug-sep.csv"]]


def test_rate_files_are_recognised_with_their_direction():
    files = statement_files("C11")
    summary = _read(files).summary()
    rates = {f["file"]: f.get("rates") for f in summary["files"] if f["kind"] == "rates"}
    assert rates["fx_rates_cny_per_usd.csv"]["CNY"]["direction"] == "CNY per 1 USD"
    assert rates["fx_rates_usd_per_unit.csv"]["EUR"]["direction"] == "USD per 1 EUR"
    assert summary["rate_sources"] == {"CNY": "your rate file", "EUR": "your rate file", "GBP": "your rate file"}


def test_detect_endpoint(client):
    r = client.post("/api/personal/detect", json={"files": statement_files("C01", rates=False)})
    assert r.status_code == 200
    labels = {p["label"] for p in r.json()["import"]["platforms"]}
    assert labels == {ledger.LABEL[p] for p in data.find_creator("C01")["accounts"]}


def test_nothing_readable_is_a_clear_422(client):
    r = client.post("/api/personal/overview", json={"files": [{"name": "x.csv", "content": "a,b\n1,2"}]})
    assert r.status_code == 422 and "None of these files" in r.json()["detail"]["message"]


# ---------------------------------------------------------------- reference rates

ECB = {  # EUR-based, as the ECB publishes them; 2026-08-29/30 is a weekend
    "2026-08-28": {"CNY": "7.8251", "GBP": "0.8572", "USD": "1.1643"},
    "2026-08-31": {"CNY": "7.7922", "GBP": "0.85648", "USD": "1.1596"},
}


def test_ecb_rates_cross_through_eur_and_cover_weekends(monkeypatch):
    monkeypatch.setattr(fx, "_ecb_range", lambda start, end, symbols: ECB)
    rates = fx.resolve({}, {"CNY": {"2026-08-30"}, "GBP": {"2026-08-31"}, "EUR": {"2026-08-28"}})
    weekend = rates.get("CNY", "2026-08-30")
    assert (weekend.rate_date, weekend.source) == ("2026-08-28", fx.ECB)
    assert weekend.rate == Decimal("7.8251") / Decimal("1.1643")
    assert rates.get("GBP", "2026-08-31").rate == Decimal("1.1596") / Decimal("0.85648")
    assert rates.get("EUR", "2026-08-28").rate == Decimal("1.1643")
    assert rates.get("CNY", "2026-09-20") is None  # more than a week after the last publication


def test_uploaded_rates_win_and_are_never_filled_in(monkeypatch):
    monkeypatch.setattr(fx, "_ecb_range", lambda start, end, symbols: ECB)
    rates = fx.resolve({"CNY": {"2026-08-31": Decimal("7.1")}}, {"CNY": {"2026-08-30", "2026-08-31"}})
    assert rates.get("CNY", "2026-08-31").source == fx.UPLOADED
    assert rates.get("CNY", "2026-08-30") is None


def test_rates_unavailable_means_missing_not_estimated(client):
    req = {"files": statement_files("C01", rates=False), "month": "2026-09"}
    body = client.post("/api/personal/overview", json=req).json()
    assert body["complete"] is False
    assert {i["currency"] for i in body["issues"]} == {"CNY"}
    assert body["import"]["rates_note"]
    bilibili = [p for p in body["platforms"] if p["platform"] == "bilibili"]
    assert bilibili == []  # left out of every total until a rate exists


# ---------------------------------------------------------------- CNY

def test_cny_amounts(client):
    usd = client.post("/api/personal/ledger", json=request_for("C01", month="2026-09")).json()
    cny = client.post("/api/personal/ledger", json=request_for("C01", month="2026-09", currency="CNY")).json()
    assert cny["currency"] == "CNY" and cny["complete"]
    table = {d: Decimal(str(v)) for d, v in data.fx_rates().items()}
    for u, c in zip(usd["rows"], cny["rows"]):
        assert (u["date"], u["platform"], u["type"]) == (c["date"], c["platform"], c["type"])
        if u["original"]["currency"] == "CNY":  # shown as it is, no conversion
            assert c["fx_cny"] is None and c["net_cny"] == u["original"]["net"]
        else:
            rate = table[u["date"]]
            assert c["fx_cny"]["rate"] == float(rate)
            rec_net = Decimal(str(u["original"]["net"]))
            assert c["net_cny"] == ledger.cents(rec_net * rate)
    overview = client.post("/api/personal/overview", json=request_for("C01", month="2026-09", currency="CNY")).json()
    bili = next(p for p in overview["platforms"] if p["platform"] == "bilibili")
    assert bili["gross"] == bili["native_cny"]["gross"] and bili["net"] == bili["native_cny"]["net"]
    assert overview["set_aside"]["base"] == "net income in CNY"

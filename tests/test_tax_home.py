"""US, China, or both: what the tax page adds for each tax home."""
from __future__ import annotations

from conftest import request_for
from daoshou import tax_home


def test_us_estimated_tax_dates_move_off_weekends():
    assert tax_home.us_estimated_tax_due_dates(2026) == ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]
    # June 15, 2025 was a Sunday
    assert tax_home.us_estimated_tax_due_dates(2025) == ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"]
    assert tax_home.next_us_estimated_tax_due("2026-01-10") == "2026-01-15"
    assert tax_home.next_us_estimated_tax_due("2027-01-16") == "2027-04-15"


def _tax(client, home, **extra):
    req = request_for("C01", period="2026-Q3", after="2026-09-01", tax_home=home, **extra)
    return client.post("/api/personal/tax-items", json=req).json()


def test_us_home(client):
    t = _tax(client, "US")
    assert [s["country"] for s in t["by_country"]] == ["US"]
    us = t["by_country"][0]
    assert us["deadlines"][0]["date"] == "2026-09-15"
    texts = " ".join(i["text"] for i in us["items"])
    assert "Bilibili (CN)" in texts and "foreign tax credit" in texts and "FBAR" in texts
    assert t["forms"]["platforms"] and t["next_us_estimated_tax_due"]["due_date"] == "2026-09-15"
    assert all(i["basis"] in ("real", "simulated") for i in us["items"])


def test_china_home(client):
    t = _tax(client, "CN", currency="CNY")
    assert [s["country"] for s in t["by_country"]] == ["CN"]
    cn = t["by_country"][0]
    assert [(d["id"], d["opens"], d["closes"]) for d in cn["deadlines"]] == [
        ("cn_annual_reconciliation", "2027-03-01", "2027-06-30"), ("cn_foreign_income", "2027-03-01", "2027-06-30")]
    texts = " ".join(i["text"] for i in cn["items"])
    assert "Bilibili withheld ¥" in texts and "prepaid" in texts
    assert t["forms"] == {"applies": False, "note": t["forms"]["note"]} and t["next_us_estimated_tax_due"] is None
    assert t["currency"] == "CNY" and "total_net_cny" in t and t["set_aside"]["base"] == "net income in CNY"
    forms = client.post("/api/personal/forms", json=request_for("C01", period="2026-Q3", tax_home="CN")).json()
    assert forms["applies"] is False


def test_both_homes(client):
    t = _tax(client, "BOTH")
    assert [s["country"] for s in t["by_country"]] == ["US", "CN"]
    assert t["forms"]["platforms"] and t["next_us_estimated_tax_due"]["due_date"] == "2026-09-15"
    labels = {a["topic"]: a["basis"] for a in t["assumptions"]}
    assert labels["1099-K threshold"] == "real" and labels["Which form each platform sends"] == "simulated"

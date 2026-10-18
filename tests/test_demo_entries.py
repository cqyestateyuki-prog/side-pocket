"""The sample account's own entries and goal (v1.4): POST /api/{overview,ledger,report} and GET /api/entries."""
import json

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _fixture(client):
    return client.get("/api/entries", params={"creator": "C01"}).json()


def test_entries_serves_the_fixture(client):
    fx = _fixture(client)
    assert len(fx["entries"]) == 17 and fx["monthly_goal"] == {"amount": 6000, "currency": "USD"}
    assert client.get("/api/entries", params={"creator": "C11"}).json()["entries"] == []


@pytest.mark.parametrize("path,params", [("overview", {"month": "2026-08"}), ("ledger", {"month": "2026-09"}),
                                         ("report", {"period": "2026-Q3", "after": "2026-10-17"})])
def test_post_with_the_fixture_matches_get(client, path, params):
    fx = _fixture(client)
    got = client.get(f"/api/{path}", params={"creator": "C01", **params}).json()
    posted = client.post(f"/api/{path}", json={"creator": "C01", **params, "entries": fx["entries"],
                                               "monthly_goal": fx["monthly_goal"]}).json()
    got.pop("generated_on", None), posted.pop("generated_on", None)
    assert json.dumps(got, sort_keys=True) == json.dumps(posted, sort_keys=True)


def test_income_is_rounded_once_and_matches_the_goal(client):
    for m in ("2026-07", "2026-08", "2026-09"):
        o = client.get("/api/overview", params={"creator": "C01", "month": m}).json()
        k = o["kept_after_expenses"]
        assert k["income"] == o["goal"]["months"][0]["income"]
        assert k["kept"] == round(k["income"] - k["expenses"], 2)
    aug = client.get("/api/overview", params={"creator": "C01", "month": "2026-08"}).json()
    assert aug["kept_after_expenses"]["income"] == 5673.38
    assert aug["income_month_over_month"] == {"previous_month": "2026-07", "previous_income": 5893.64,
                                              "change": -220.26, "change_pct": -0.0374}


def test_added_entries_and_goal_count_and_notes_stay_out(client):
    fx = _fixture(client)
    extra = fx["entries"] + [{"id": "u-1", "kind": "income", "date": "2026-09-30", "amount": 300, "currency": "USD",
                              "source": "Tutoring", "note": "paid in cash"}]
    o = client.post("/api/overview", json={"creator": "C01", "month": "2026-09", "entries": extra,
                                           "monthly_goal": {"amount": 7000, "currency": "USD"}}).json()
    assert o["kept_after_expenses"]["income"] == 6418.33 and o["goal"]["amount"] == 7000.0
    assert "paid in cash" not in json.dumps(o)
    none = client.post("/api/overview", json={"creator": "C01", "month": "2026-09", "entries": [], "monthly_goal": None}).json()
    assert none["goal"] is None and none["manual_income"]["total"] == 0


def test_bad_goal_is_refused(client):
    r = client.post("/api/overview", json={"creator": "C01", "month": "2026-09", "monthly_goal": {"amount": -5}})
    assert r.status_code == 422

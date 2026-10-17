"""Shared fixtures. Tests never reach the network: ECB rates are stubbed unless a test supplies its own."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.main import app  # noqa: E402
from daoshou import data, fx  # noqa: E402

RATE_FILES = ["fx_rates_cny_per_usd.csv", "fx_rates_usd_per_unit.csv"]


def statement_files(creator_id: str, *, rates: bool = True) -> list[dict]:
    """What the creator would upload: each platform's export with only their rows, plus the rate files."""
    c = data.find_creator(creator_id)
    files = [{"name": data.EXPORTS[p][0], "content": data.export_csv(p, a)} for p, a in c["accounts"].items()]
    if rates:
        files += [{"name": f, "content": (data.DATA / f).read_text(encoding="utf-8")} for f in RATE_FILES]
    return files


def request_for(creator_id: str, **extra) -> dict:
    c = data.find_creator(creator_id)
    return {"files": statement_files(creator_id), "set_aside_rate": c["set_aside_rate"],
            "payout_methods": c.get("payout_methods", {}), **extra}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def offline(*_args, **_kwargs):
        raise fx.httpx.ConnectError("tests don't reach the network")
    monkeypatch.setattr(fx, "_ecb_range", offline)


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)

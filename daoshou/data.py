"""Read access to the fictional test data in daoshou_testdata/data."""
from __future__ import annotations

import csv
import io
import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "daoshou_testdata" / "data"

# platform -> (file, account column, encoding)
EXPORTS = {
    "bilibili": ("bilibili_income.csv", "账号ID", "utf-8-sig"),
    "youtube": ("youtube_revenue.csv", "Channel ID", "utf-8"),
    "twitch": ("twitch_payouts.csv", "Username", "utf-8"),
    "patreon": ("patreon_earnings.csv", "Creator", "utf-8"),
    "upwork": ("upwork_transactions.csv", "Freelancer", "utf-8"),
    "fiverr": ("fiverr_earnings.csv", "Seller", "utf-8"),
    "freelancer": ("freelancer_transactions.csv", "username", "utf-8"),
    "contra": ("contra_payments.csv", "Profile", "utf-8"),
}


@lru_cache
def creators() -> dict[str, dict]:
    return {c["creator_id"]: c for c in json.loads((DATA / "creators.json").read_text(encoding="utf-8"))}


def find_creator(name_or_id: str) -> dict | None:
    key = name_or_id.strip().lower()
    for c in creators().values():
        if key in (c["creator_id"].lower(), c["name"].lower()):
            return c
    return None


@lru_cache
def questions() -> list[dict]:
    lines = (DATA / "questions.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


@lru_cache
def export_rows(platform: str) -> tuple[list[str], list[dict]]:
    file, _, encoding = EXPORTS[platform]
    with open(DATA / file, encoding=encoding, newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def export_csv(platform: str, account: str) -> str:
    """The platform export as a creator would download it: header plus their rows."""
    header, rows = export_rows(platform)
    account_col = EXPORTS[platform][1]
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=header, lineterminator="\n")
    writer.writeheader()
    writer.writerows(r for r in rows if r[account_col] == account)
    return out.getvalue()


@lru_cache
def fx_rates() -> dict[str, float]:
    """CNY per 1 USD, by date."""
    with open(DATA / "fx_rates_cny_per_usd.csv", encoding="utf-8", newline="") as f:
        return {r["date"]: float(r["cny_per_usd"]) for r in csv.DictReader(f)}


@lru_cache
def fx_usd_per_unit() -> dict[str, dict[str, float]]:
    """USD per 1 EUR / 1 GBP, by date (the opposite direction to the CNY table)."""
    with open(DATA / "fx_rates_usd_per_unit.csv", encoding="utf-8", newline="") as f:
        return {r["date"]: {"EUR": float(r["EUR"]), "GBP": float(r["GBP"])} for r in csv.DictReader(f)}


@lru_cache
def assumptions() -> dict:
    return json.loads((DATA / "assumptions.json").read_text(encoding="utf-8"))

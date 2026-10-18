"""Badge and goal rules on hand-made events (daoshou/rewards.py is pure)."""
from __future__ import annotations

from decimal import Decimal

from daoshou.rewards import Event, badges, goal_progress, month_range


def inc(day, usd, source="Upwork", platform="upwork", currency="USD", cny=None, positive=True):
    usd = None if usd is None else Decimal(str(usd))
    cny = (usd * 7 if usd is not None else None) if cny is None else Decimal(str(cny))
    return Event(day, "income", source, platform, currency, positive, usd, cny)


def by_id(evs, as_of, currency="USD"):
    return {b["id"]: b for b in badges(evs, currency=currency, as_of=as_of)}


def test_month_range_crosses_years():
    assert month_range("2025-11", "2026-02") == ["2025-11", "2025-12", "2026-01", "2026-02"]


def test_first_month_over_1000_is_dated_when_the_running_total_crosses():
    evs = [inc("2026-07-03", 400), inc("2026-07-09", 500), inc("2026-08-02", 700), inc("2026-08-20", 400)]
    b = by_id(evs, "2026-08")["first_1k_month"]
    assert (b["earned"], b["earned_on"], b["numbers"]["month"], b["numbers"]["income_usd"]) == (
        True, "2026-08-20", "2026-08", 1100.0)
    early = by_id(evs, "2026-07")["first_1k_month"]
    assert not early["earned"] and early["progress"] == {"current": 900.0, "target": 1000.0, "unit": "USD"}


def test_thresholds_use_usd_even_when_shown_in_cny():
    evs = [inc("2026-07-03", 999, cny=99_999)]
    b = by_id(evs, "2026-07", currency="CNY")["first_1k_month"]
    assert not b["earned"]


def test_best_month_must_beat_every_earlier_month():
    evs = [inc("2026-07-01", 900), inc("2026-08-01", 500), inc("2026-09-01", 600), inc("2026-09-15", 301)]
    b = by_id(evs, "2026-09")["best_month"]
    assert b["earned_on"] == "2026-09-15" and b["numbers"]["previous_best_month"] == "2026-07"
    assert not by_id(evs, "2026-07")["best_month"]["earned"]  # one month beats nothing


def test_growth_streak_needs_three_increases_in_a_row():
    four = [inc("2026-06-01", 100), inc("2026-07-01", 200), inc("2026-08-01", 300), inc("2026-09-01", 250),
            inc("2026-09-20", 100)]
    b = by_id(four, "2026-09")["growth_streak_3"]
    assert b["earned"] and b["numbers"]["months"] == ["2026-06", "2026-07", "2026-08", "2026-09"]
    assert b["earned_on"] == "2026-09-20"  # September passed August's 300 that day
    assert by_id(four, "2026-08")["growth_streak_3"]["progress"]["current"] == 2


def test_an_empty_month_breaks_the_streak():
    evs = [inc("2026-05-01", 100), inc("2026-06-01", 200), inc("2026-08-01", 300), inc("2026-09-01", 400)]
    assert not by_id(evs, "2026-09")["growth_streak_3"]["earned"]  # July had nothing


def test_sources_and_currencies():
    evs = [inc("2026-07-01", 10, "B站", "bilibili", "CNY"), inc("2026-07-01", 10, "Twitch", "twitch"),
           inc("2026-07-02", 10, "YouTube", "youtube"), inc("2026-07-05", 10, "Tutoring", None, "CNY"),
           inc("2026-07-07", -3, "Fiverr", "fiverr", positive=False),  # a fee row is not a new source
           inc("2026-08-12", 10, "Logo commission", None, "EUR"), inc("2026-08-21", 10, "Upwork", "upwork")]
    b = by_id(evs, "2026-08")
    assert b["new_source"]["earned_on"] == "2026-08-12" and b["new_source"]["numbers"]["manual"] is True
    assert [a["source"] for a in b["new_source"]["numbers"]["added"]] == ["Logo commission", "Upwork"]
    assert b["five_sources"]["earned_on"] == "2026-08-12" and b["five_sources"]["numbers"]["fifth"] == "Logo commission"
    assert b["new_currency"]["numbers"] == {"currency": "EUR", "first_date": "2026-08-12",
                                            "earlier_currencies": ["CNY", "USD"]}
    july = by_id(evs, "2026-07")
    assert not july["new_currency"]["earned"]  # CNY and USD both arrived on the first day
    assert july["five_sources"]["progress"] == {"current": 4, "target": 5, "unit": "sources"}


def test_total_over_10000():
    evs = [inc(f"2026-0{m}-10", 3000) for m in range(5, 9)]
    b = by_id(evs, "2026-08")["total_10k"]
    assert b["earned_on"] == "2026-08-10" and b["numbers"]["total_usd"] == 12000.0


def test_complete_month_counts_platforms_started_by_then_and_needs_every_rate():
    evs = [inc("2026-07-01", 10, "B站", "bilibili", "CNY", cny=70), inc("2026-07-03", None, "B站", "bilibili", "CNY",
                                                                        cny=70),
           inc("2026-07-04", 10, "Twitch", "twitch"),
           inc("2026-08-01", 10, "B站", "bilibili"), inc("2026-08-21", 10, "Upwork", "upwork"),
           inc("2026-09-01", 10, "B站", "bilibili"), inc("2026-09-02", 10, "Twitch", "twitch"),
           inc("2026-09-03", 10, "Upwork", "upwork")]
    assert not by_id(evs, "2026-08")["complete_month"]["earned"]  # July lacks a rate; August lacks Twitch
    b = by_id(evs, "2026-09")["complete_month"]
    assert b["numbers"] == {"month": "2026-09", "platforms": 3} and b["earned_on"] == "2026-09-03"
    assert by_id(evs, "2026-07", currency="CNY")["complete_month"]["earned"]  # in CNY the CNY row is fine


def test_badges_only_see_events_up_to_the_month_asked_about():
    evs = [inc("2026-07-01", 6000), inc("2026-08-01", 6000)]
    assert not by_id(evs, "2026-07")["total_10k"]["earned"] and by_id(evs, "2026-08")["total_10k"]["earned"]


def test_no_income_gives_every_badge_unearned():
    out = badges([], currency="USD", as_of="2026-09")
    assert len(out) == 8 and not any(b["earned"] for b in out)
    assert all(b["title_key"] == f"badge.{b['id']}" for b in out)


def test_goal_progress():
    evs = [inc("2026-08-03", 2500), inc("2026-08-19", 2600), inc("2026-09-04", 1000),
           inc("2026-09-05", None, cny=100), Event("2026-09-06", "expense", "Equipment", None, "USD", True,
                                                   Decimal(500), Decimal(3500))]
    g = goal_progress(evs, ["2026-08", "2026-09"], Decimal(5000), "USD")
    aug, sep = g["months"]
    assert (aug["reached"], aug["reached_on"], aug["remaining"], aug["progress"]) == (True, "2026-08-19", 0.0, 1.02)
    assert (sep["income"], sep["reached"], sep["complete"]) == (1000.0, False, False)  # expenses don't count
    assert g["months_reached"] == 1 and g["basis"].startswith("income")
    cny = goal_progress(evs, ["2026-09"], Decimal(7000), "CNY")["months"][0]
    assert cny["income"] == 7100.0 and cny["reached_on"] == "2026-09-04"  # reaching it exactly counts

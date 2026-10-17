"""Compare a submitted answer with the question's reference answer."""
from __future__ import annotations

PLATFORM_ALIASES = {
    "b站": "B站", "b 站": "B站", "bilibili": "B站", "哔哩哔哩": "B站",
    "youtube": "YouTube", "twitch": "Twitch", "patreon": "Patreon", "upwork": "Upwork",
    "fiverr": "Fiverr", "freelancer.com": "Freelancer.com", "freelancer": "Freelancer.com", "contra": "Contra",
}


def _platform(value) -> str | None:
    return PLATFORM_ALIASES.get(str(value).strip().lower()) if value is not None else None


def _number(value) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", "").replace("$", "").replace("¥", "").strip())
    except ValueError:
        return None


def grade(question: dict, submitted: dict | None) -> tuple[bool, str | None]:
    """(ok, reason). The reason is what PRISM sees on a failed run."""
    expected = question["expected_answer"]
    if submitted is None:
        return False, "NoAnswer: submit_answer was never called"
    got = submitted.get("answer")

    if question["category"] == "alert_missing_fx":
        if got in (None, "", "null"):
            return True, None
        return False, f"FabricatedAnswer: expected a refusal (missing FX rate), got {got!r}"

    if question["unit"] == "platform":
        if _platform(got) == expected:
            return True, None
        return False, f"WrongAnswer: expected {expected}, got {got!r}"

    if question["unit"] == "date":
        if str(got).strip()[:10] == expected:
            return True, None
        return False, f"WrongAnswer: expected {expected}, got {got!r}"

    value = _number(got)
    if value is None:
        return False, f"WrongAnswer: expected {expected} {question['unit']}, got non-number {got!r}"
    diff = round(value - expected, 2)
    if abs(value - expected) <= (question.get("tolerance") or 0) + 1e-9:
        return True, None
    return False, f"WrongAnswer: expected {expected} {question['unit']}, got {value} (diff {diff:+})"

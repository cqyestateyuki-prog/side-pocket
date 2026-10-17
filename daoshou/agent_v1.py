"""v1: hand the model the raw platform exports and let it do the math itself.

This is the first version described in the requirements doc. The tools only
fetch data and record the answer; summing, currency conversion and fee/tax
classification all happen inside the model.
"""
from __future__ import annotations

from . import data
from .prism_tracing import ToolError

SYSTEM = """You are Daoshou (到手), an income assistant for creators who run a one-person US LLC \
and earn on both Chinese and US platforms (Bilibili, YouTube, Twitch, Patreon, Upwork).

Answer the user's question from the creator's own platform exports. Net income (到手) is what is \
left after platform fees, payout fees and any tax the platform withheld. Report USD unless asked \
otherwise, converting CNY with the exchange rates provided. The tax set-aside uses the creator's \
own set_aside_rate.

Look the creator up, read the exports you need, work out the answer, then call submit_answer \
exactly once (a number, or a platform name for "which platform" questions; null if it cannot be \
answered). After that, reply with a short explanation in the user's language."""

TOOLS = [
    {"type": "function", "function": {
        "name": "find_creator",
        "description": "Look up a creator by name or id. Returns their platform accounts and settings.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "read_platform_export",
        "description": "Raw CSV export of one platform account (all months), exactly as the platform provides it.",
        "parameters": {"type": "object", "properties": {
            "platform": {"type": "string", "enum": list(data.EXPORTS)},
            "account": {"type": "string"}}, "required": ["platform", "account"]}}},
    {"type": "function", "function": {
        "name": "read_fx_rates",
        "description": "Daily CNY-per-USD rates for a month (YYYY-MM), as CSV.",
        "parameters": {"type": "object", "properties": {"month": {"type": "string"}}, "required": ["month"]}}},
    {"type": "function", "function": {
        "name": "submit_answer",
        "description": "Record the final answer. Call exactly once.",
        "parameters": {"type": "object", "properties": {
            "answer": {"type": ["number", "string", "null"]},
            "unit": {"type": "string", "description": "USD, CNY or platform"},
            "explanation": {"type": "string"}}, "required": ["answer", "unit"]}}},
]


def make_tools(state: dict) -> dict:
    def find_creator(name: str) -> dict:
        c = data.find_creator(name)
        if c is None:
            raise ToolError(f"no creator named {name!r}")
        return {k: c[k] for k in ("creator_id", "name", "tax_country", "set_aside_rate", "accounts")}

    def read_platform_export(platform: str, account: str) -> str:
        if platform not in data.EXPORTS:
            raise ToolError(f"unknown platform {platform!r}")
        return data.export_csv(platform, account)

    def read_fx_rates(month: str) -> str:
        rows = [f"{d},{r}" for d, r in sorted(data.fx_rates().items()) if d.startswith(month)]
        return "date,cny_per_usd\n" + "\n".join(rows)

    def submit_answer(answer=None, unit: str = "", explanation: str = "") -> dict:
        state["submitted"] = {"answer": answer, "unit": unit, "explanation": explanation}
        return {"status": "recorded"}

    return {"find_creator": find_creator, "read_platform_export": read_platform_export,
            "read_fx_rates": read_fx_rates, "submit_answer": submit_answer}

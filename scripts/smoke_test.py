"""End-to-end setup check: one Nicrron tool-calling run, traced into PRISM."""
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from daoshou.prism_tracing import TracedAgent, default_model  # noqa: E402

FX = {"USD": 1.0, "CNY": 0.1389}


def get_payout(platform: str) -> dict:
    data = {"youtube": {"gross": 1200.0, "currency": "USD"},
            "bilibili": {"gross": 5000.0, "currency": "CNY"}}
    return data[platform.lower()]


def convert_to_usd(amount: float, currency: str) -> dict:
    return {"usd": round(amount * FX[currency], 2)}


TOOLS = [
    {"type": "function", "function": {
        "name": "get_payout", "description": "Gross payout for one platform this month.",
        "parameters": {"type": "object", "properties": {"platform": {"type": "string"}},
                       "required": ["platform"]}}},
    {"type": "function", "function": {
        "name": "convert_to_usd", "description": "Convert an amount to USD.",
        "parameters": {"type": "object", "properties": {"amount": {"type": "number"},
                                                         "currency": {"type": "string"}},
                       "required": ["amount", "currency"]}}},
]

agent = TracedAgent(
    agent_id="daoshou-smoke", agent_name="daoshou-smoke", version="v0",
    model=default_model(),
    system="You total a creator's income. Use the tools; never do currency math yourself.",
    tools=TOOLS, tool_impls={"get_payout": get_payout, "convert_to_usd": convert_to_usd},
)

res = agent.run("What did I earn in USD from YouTube and Bilibili this month?",
                session_id=f"setup-smoke-{uuid.uuid4().hex[:6]}")
print({k: v for k, v in res.items() if k != "output"})
print(res["output"])

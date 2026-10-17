"""v2: code does the math, the model only orchestrates and explains.

Follows the requirements doc's 10-step flow: read each platform (1-5), convert
CNY at each record's own date (6), break down deductions (7), set-aside (8),
Patreon iOS simulation (9), then the model answers using only those numbers
(10). A missing exchange rate raises instead of being estimated, which marks
the run failed in PRISM and fires the alert.
"""
from __future__ import annotations

from decimal import Decimal

from . import data, ledger
from .prism_tracing import ToolError

SYSTEM = """You are Daoshou (到手), an income assistant for creators who run a one-person US LLC \
and earn on both Chinese and US platforms (Bilibili, YouTube, Twitch, Patreon, Upwork).

Every number you give must come straight from a tool output. Never do arithmetic yourself, never \
estimate, and never substitute or interpolate an exchange rate.

Flow for a monthly question:
1. find_creator.
2. load_platform for each platform the creator has an account on (or only the platform asked about).
3. convert_currency for the month (converts CNY records at each record's own date).
4. compute_breakdown for the month: per-platform and total gross, platform fees, payout fees, \
withheld tax and net in USD, native CNY figures, and net rates.
5. If needed: compute_set_aside, simulate_patreon_ios, or compare_months.
Upwork contract fee questions: get_upwork_contract_fees.

If any tool reports missing data (for example MissingFXRate), do not work around it: call \
submit_answer with answer null and say exactly what is missing.

Call submit_answer exactly once with the figure exactly as a tool reported it (USD unless the \
question asks for CNY; a platform name for "which platform" questions). Then reply with a short \
explanation in the user's language."""

_creator = {"creator_id": {"type": "string"}}
_month = {"month": {"type": "string", "description": "YYYY-MM"}}

TOOLS = [
    {"type": "function", "function": {
        "name": "find_creator",
        "description": "Look up a creator by name or id. Returns their platform accounts and settings.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "load_platform",
        "description": "Parse one platform's export for a creator and month into ledger records (native currency).",
        "parameters": {"type": "object", "properties": {
            **_creator, "platform": {"type": "string", "enum": ledger.PLATFORMS}, **_month},
            "required": ["creator_id", "platform", "month"]}}},
    {"type": "function", "function": {
        "name": "convert_currency",
        "description": "Convert the creator's CNY records for the month to USD at each record's own date. "
                       "Fails if a rate is missing.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "compute_breakdown",
        "description": "Per-platform and total breakdown in USD (gross, platform fee, payout fee, withheld tax, "
                       "net, net rate), native CNY figures, and the platform with the highest net rate.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "compute_set_aside",
        "description": "Tax set-aside for the month: total net USD x the creator's own set_aside_rate.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "simulate_patreon_ios",
        "description": "How much less Patreon would pay if Apple took its simulated extra cut of iOS pledges.",
        "parameters": {"type": "object", "properties": {**_creator, **_month},
                       "required": ["creator_id", "month"]}}},
    {"type": "function", "function": {
        "name": "compare_months",
        "description": "Change in total net USD from earlier_month to later_month (later minus earlier).",
        "parameters": {"type": "object", "properties": {
            **_creator, "later_month": {"type": "string"}, "earlier_month": {"type": "string"}},
            "required": ["creator_id", "later_month", "earlier_month"]}}},
    {"type": "function", "function": {
        "name": "get_upwork_contract_fees",
        "description": "Upwork service fees charged on one contract across all months, fee per payment and total.",
        "parameters": {"type": "object", "properties": {**_creator, "contract_id": {"type": "string"}},
                       "required": ["creator_id", "contract_id"]}}},
    {"type": "function", "function": {
        "name": "submit_answer",
        "description": "Record the final answer. Call exactly once.",
        "parameters": {"type": "object", "properties": {
            "answer": {"type": ["number", "string", "null"]},
            "unit": {"type": "string", "description": "USD, CNY or platform"},
            "explanation": {"type": "string"}}, "required": ["answer", "unit"]}}},
]


def _money(values: dict[str, Decimal]) -> dict[str, float]:
    return {k: ledger.cents(v) for k, v in values.items()}


def make_tools(state: dict) -> dict:
    def creator(creator_id: str) -> dict:
        c = data.find_creator(creator_id)
        if c is None:
            raise ToolError(f"no creator {creator_id!r}")
        return c

    def check_month(month: str) -> str:
        if len(month) != 7 or month[4] != "-":
            raise ToolError(f"month must be YYYY-MM, got {month!r}")
        return month

    def breakdown(creator_id: str, month: str) -> dict:
        try:
            return ledger.month_breakdown(creator(creator_id), check_month(month))
        except ledger.MissingFXRate as e:
            raise ToolError(f"MissingFXRate: no CNY/USD rate for {e}; CNY records on that date cannot be "
                            f"converted and no rate may be estimated") from None

    def find_creator(name: str) -> dict:
        c = data.find_creator(name)
        if c is None:
            raise ToolError(f"no creator named {name!r}")
        return {k: c[k] for k in ("creator_id", "name", "tax_country", "set_aside_rate", "accounts")}

    def load_platform(creator_id: str, platform: str, month: str) -> dict:
        try:
            key = ledger.platform_key(platform)
        except ValueError as e:
            raise ToolError(str(e)) from None
        recs = ledger.records(creator(creator_id), key, check_month(month))
        state.setdefault("loaded", {})[(key, month)] = len(recs)
        if not recs:
            return {"platform": key, "month": month, "records": 0, "note": "no records this month"}
        return {"platform": key, "month": month, "records": len(recs), "currency": recs[0].currency,
                "dates": [recs[0].date, recs[-1].date],
                "record_types": sorted({r.kind for r in recs}),
                "has_withheld_tax": any(r.withheld for r in recs)}

    def convert_currency(creator_id: str, month: str) -> dict:
        recs = ledger.records(creator(creator_id), "bilibili", check_month(month))
        if not recs:
            return {"month": month, "cny_records": 0, "note": "no CNY records this month"}
        rates = data.fx_rates()
        missing = sorted({r.date for r in recs if r.date not in rates})
        if missing:
            raise ToolError(f"MissingFXRate: no CNY/USD rate for {', '.join(missing)}; "
                            f"{sum(r.date in missing for r in recs)} CNY record(s) cannot be converted "
                            f"and no rate may be estimated")
        used = {r.date: rates[r.date] for r in recs}
        return {"month": month, "cny_records": len(recs), "rule": "USD = CNY / rate of the record's own date",
                "rates_used_cny_per_usd": used}

    def compute_breakdown(creator_id: str, month: str) -> dict:
        b = breakdown(creator_id, month)
        platforms = {}
        best, best_rate = None, None
        for p, t in b["platforms"].items():
            row = _money(t["usd"])
            if t["usd"]["gross"]:
                rate = t["usd"]["net"] / t["usd"]["gross"]
                row["net_rate"] = float(round(rate, 4))
                if best_rate is None or rate > best_rate:
                    best, best_rate = p, rate
            if "native_cny" in t:
                row["native_cny"] = _money(t["native_cny"])
            platforms[ledger.LABEL[p]] = row
        out = {"month": month, "currency": "USD", "platforms": platforms, "total": _money(b["total"]),
               "best_platform_by_net_rate": ledger.LABEL[best] if best else None}
        if not platforms:
            out["note"] = "no income records this month"
        return out

    def compute_set_aside(creator_id: str, month: str) -> dict:
        b = breakdown(creator_id, month)
        rate = ledger.D(creator(creator_id)["set_aside_rate"])
        return {"month": month, "total_net_usd": ledger.cents(b["total"]["net"]), "set_aside_rate": float(rate),
                "set_aside_usd": ledger.cents(b["total"]["net"] * rate),
                "note": "estimate from the creator's own rate, not tax advice"}

    def simulate_patreon_ios(creator_id: str, month: str) -> dict:
        t = ledger.platform_totals(creator(creator_id), "patreon", check_month(month))
        if t is None:
            return {"month": month, "note": "no Patreon records this month", "impact_usd": 0.0}
        fee = ledger.D(ledger.assumptions()["patreon_ios_apple_fee_simulated"])
        return {"month": month, "ios_pledges_usd": ledger.cents(t["ios"]), "simulated_apple_fee_rate": float(fee),
                "impact_usd": ledger.cents(t["ios"] * fee)}

    def compare_months(creator_id: str, later_month: str, earlier_month: str) -> dict:
        later = breakdown(creator_id, later_month)["total"]["net"]
        earlier = breakdown(creator_id, earlier_month)["total"]["net"]
        return {"later_month": later_month, "later_net_usd": ledger.cents(later),
                "earlier_month": earlier_month, "earlier_net_usd": ledger.cents(earlier),
                "change_usd": ledger.cents(later - earlier)}

    def get_upwork_contract_fees(creator_id: str, contract_id: str) -> dict:
        recs = [r for r in ledger.records(creator(creator_id), "upwork") if r.contract_id == contract_id]
        if not recs:
            raise ToolError(f"no Upwork payments on contract {contract_id!r} for {creator_id}")
        return {"contract_id": contract_id,
                "payments": [{"date": r.date, "amount_usd": float(r.gross), "fee_usd": float(r.platform_fee)}
                             for r in recs],
                "total_fee_usd": ledger.cents(sum((r.platform_fee for r in recs), Decimal(0)))}

    def submit_answer(answer=None, unit: str = "", explanation: str = "") -> dict:
        state["submitted"] = {"answer": answer, "unit": unit, "explanation": explanation}
        return {"status": "recorded"}

    return {f.__name__: f for f in (find_creator, load_platform, convert_currency, compute_breakdown,
                                    compute_set_aside, simulate_patreon_ios, compare_months,
                                    get_upwork_contract_fees, submit_answer)}

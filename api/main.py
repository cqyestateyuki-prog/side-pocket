"""Side Atlas HTTP API.

Every number comes from daoshou/ledger.py (deterministic Decimal math). The model only
runs in POST /api/ask, which streams the v2 agent's steps as Server-Sent Events and is
traced into PRISM like any other run. A record whose date has no exchange rate is never
estimated: it is left out of the totals and reported under `issues`, with `complete: false`.

    .venv/bin/uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import queue
import threading
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

from functools import lru_cache

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

from daoshou import agent_v2, data, ledger  # noqa: E402
from daoshou.prism_tracing import TracedAgent, default_model, nicrron_client  # noqa: E402

app = FastAPI(title="Side Atlas API", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MONEY = ("gross", "platform_fee", "payout_fee", "withheld", "net")
ZERO = Decimal(0)
DISCLAIMER = agent_v2.DISCLAIMER


# ---------------------------------------------------------------- helpers

def _creator(creator_id: str) -> dict:
    c = data.find_creator(creator_id)
    if c is None:
        raise HTTPException(404, f"no creator {creator_id!r}")
    return c


def _profile(c: dict) -> dict:
    return {"id": c["creator_id"], "name": c["name"], "profile": c.get("profile"),
            "tax_country": c["tax_country"], "set_aside_rate": c["set_aside_rate"],
            "active_months": c.get("active_months", []),
            "platforms": [{"key": p, "label": ledger.LABEL.get(p, p), "account": acct,
                           "payout_method": ledger.payout_method(c, p)}
                          for p, acct in c["accounts"].items()]}


def _month(month: str) -> str:
    if (len(month) != 7 or month[4] != "-" or not (month[:4] + month[5:]).isdigit()
            or not 1 <= int(month[5:]) <= 12):
        raise HTTPException(422, f"month must be YYYY-MM, got {month!r}")
    return month


def _months(period: str) -> list[str]:
    try:
        months = ledger.months_in(period)
    except (ValueError, IndexError):
        raise HTTPException(422, f"period must be YYYY-MM, YYYY-Qn or YYYY-MM~YYYY-MM, got {period!r}") from None
    return [_month(m) for m in months]


def _day(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(422, f"date must be YYYY-MM-DD, got {value!r}") from None


def _previous(month: str) -> str:
    y, m = int(month[:4]), int(month[5:])
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def _m(values: dict) -> dict:
    return {k: ledger.cents(values[k]) for k in MONEY}


def _ratio(a: Decimal, b: Decimal) -> float | None:
    return round(float(a / b), 4) if b else None


def _fx(rec: ledger.Record) -> dict | None:
    """The rate used for this record; raises ledger.MissingFXRate when there is none."""
    rate = ledger.rate_for(rec)
    if rate is None:
        return None
    rule = ("CNY per 1 USD (USD = CNY / rate)" if rec.currency == "CNY"
            else f"USD per 1 {rec.currency} (USD = amount × rate)")
    return {"currency": rec.currency, "rate": float(rate), "rate_date": rec.date, "rule": rule}


def _book(creator: dict, months: list[str]) -> dict:
    """Record-level rows and per-platform totals for some months.

    Totals add the unrounded USD values and round once, like ledger.month_breakdown.
    Records that cannot be converted go to `issues` and are left out of every total.
    """
    rows, issues, per = [], [], {}
    for month in months:
        for p in ledger.PLATFORMS:
            for rec in ledger.records(creator, p, month):
                ref = rec.ref or rec.contract_id or None
                row = {"date": rec.date, "month": rec.month, "platform": p, "platform_label": ledger.LABEL[p],
                       "type": rec.kind, "ref": ref,
                       "original": {"currency": rec.currency, "gross": float(rec.gross),
                                    "platform_fee": None if rec.fee_in_usd else float(rec.platform_fee),
                                    "payout_fee": float(rec.payment_fee), "withheld": float(rec.withheld),
                                    "net": None if rec.fee_in_usd else float(rec.net)}}
                try:
                    fx = _fx(rec)
                    usd = ledger.to_usd(rec)
                except ledger.MissingFXRate as e:
                    row.update({"fx": None, **{f"{k}_usd": None for k in MONEY}, "issue": "missing_fx"})
                    rows.append(row)
                    issues.append({"type": "missing_fx", "currency": e.currency, "date": rec.date,
                                   "platform": ledger.LABEL[p],
                                   "record": {"type": rec.kind, "ref": ref, "currency": rec.currency,
                                              "amount": float(rec.gross)},
                                   "message": f"No {e.currency}/USD rate for {rec.date}; this record is left out "
                                              f"of the totals until the rate is added."})
                    continue
                vals = {"gross": usd["gross"], "platform_fee": usd["platform_fee"], "payout_fee": usd["payment_fee"],
                        "withheld": usd["withheld"], "net": usd["net"]}
                row["fx"] = fx
                row.update({f"{k}_usd": ledger.cents(v) for k, v in vals.items()})
                rows.append(row)
                t = per.setdefault(p, {**{k: ZERO for k in MONEY}, "records": 0, "currencies": set(),
                                       "native_cny": {"gross": ZERO, "withheld": ZERO, "net": ZERO},
                                       "tips_gross": ZERO, "tips_fee": ZERO, "ios_pledges": ZERO})
                for k, v in vals.items():
                    t[k] += v
                t["records"] += 1
                t["currencies"].add(rec.currency)
                if rec.currency == "CNY":
                    for k in ("gross", "withheld", "net"):
                        t["native_cny"][k] += getattr(rec, k)
                if p == "fiverr" and rec.kind == "Tip":
                    t["tips_gross"] += usd["gross"]
                    t["tips_fee"] += usd["platform_fee"]
                t["ios_pledges"] += rec.ios
    rows.sort(key=lambda r: (r["date"], r["platform"]))
    total = {k: sum((t[k] for t in per.values()), ZERO) for k in MONEY}
    return {"rows": rows, "per": per, "total": total, "issues": issues}


def _platform_rows(book: dict) -> list[dict]:
    total_net = book["total"]["net"]
    out = []
    for p, t in book["per"].items():
        row = {"platform": p, "label": ledger.LABEL[p], **_m(t), "net_rate": _ratio(t["net"], t["gross"]),
               "share_of_net": _ratio(t["net"], total_net), "records": t["records"],
               "currencies": sorted(t["currencies"])}
        if "CNY" in t["currencies"]:
            row["native_cny"] = {k: ledger.cents(v) for k, v in t["native_cny"].items()}
        if p == "fiverr":
            row["tips"] = {"gross": ledger.cents(t["tips_gross"]), "fee": ledger.cents(t["tips_fee"])}
        if p == "patreon":
            row["ios_pledges"] = ledger.cents(t["ios_pledges"])
            # Simulated: what Apple's in-app cut would take from the iOS share (assumptions.json).
            rate = ledger.D(ledger.assumptions()["patreon_ios_apple_fee_simulated"])
            row["ios_simulation"] = {"apple_fee_rate": float(rate), "apple_fee": ledger.cents(t["ios_pledges"] * rate),
                                     "simulated": True}
        out.append(row)
    return sorted(out, key=lambda r: -r["net"])


def _best(platforms: list[dict]) -> dict | None:
    rated = [r for r in platforms if r["net_rate"] is not None]
    if not rated:
        return None
    best = max(rated, key=lambda r: r["net_rate"])
    return {"platform": best["platform"], "label": best["label"], "net_rate": best["net_rate"]}


def _waterfall(total: dict) -> list[dict]:
    return [{"step": "gross", "label": "Gross income", "amount": ledger.cents(total["gross"])},
            {"step": "platform_fee", "label": "Platform fees", "amount": -ledger.cents(total["platform_fee"])},
            {"step": "payout_fee", "label": "Payout & payment fees", "amount": -ledger.cents(total["payout_fee"])},
            {"step": "withheld", "label": "Tax withheld by platforms", "amount": -ledger.cents(total["withheld"])},
            {"step": "net", "label": "Net", "amount": ledger.cents(total["net"])}]


def _tax(c: dict, months: list[str], period: str, after: str) -> dict:
    book = _book(c, months)
    by_platform = []
    for p, t in book["per"].items():
        if not t["withheld"]:
            continue
        country, kind = ledger.WITHHOLDING.get(p, ("unknown", "tax withheld by the platform"))
        row = {"platform": ledger.LABEL[p], "country": country, "tax": kind,
               "withheld_usd": ledger.cents(t["withheld"])}
        if t["native_cny"]["withheld"]:
            row["withheld_cny"] = ledger.cents(t["native_cny"]["withheld"])
        by_platform.append(row)
    accountant = [f"Foreign tax withheld by {r['platform']} ({r['country']}): ${r['withheld_usd']} — ask whether it "
                  f"can be credited against your home-country tax"
                  for r in by_platform if r["country"] != c["tax_country"]]
    no_withholding = sorted(ledger.LABEL[p] for p, t in book["per"].items() if not t["withheld"])
    if no_withholding:
        accountant.append("No tax was withheld on income from " + ", ".join(no_withholding)
                          + "; the set-aside covers it")
    for issue in book["issues"]:
        accountant.append(f"Missing {issue['currency']}/USD rate for {issue['date']} ({issue['platform']}): "
                          f"that record is not in these totals yet")
    rate = ledger.D(c["set_aside_rate"])
    net = book["total"]["net"]
    due = ledger.next_us_estimated_tax_due(after)
    return {"creator": _profile(c), "period": period, "months": months, "currency": "USD",
            "complete": not book["issues"], "issues": book["issues"],
            "tax_withheld_by_platform": by_platform,
            "total_tax_withheld_usd": ledger.cents(sum((t["withheld"] for t in book["per"].values()), ZERO)),
            "total_net_usd": ledger.cents(net),
            "set_aside": {"rate": float(rate), "amount": ledger.cents(net * rate), "base": "net income in USD",
                          "rate_source": "chosen by the creator"},
            "next_us_estimated_tax_due": {
                "after": after, "due_date": due,
                "days_left": (date.fromisoformat(due) - date.fromisoformat(after)).days if due else None,
                "schedule": ledger.assumptions()["us_estimated_tax_due_dates"]},
            "items_for_accountant": accountant,
            "forms": ledger.form_check(c, months, skip_missing=True), "note": DISCLAIMER}


# ---------------------------------------------------------------- read endpoints

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model": default_model(), "creators": len(data.creators()),
            "platforms": [ledger.LABEL[p] for p in ledger.PLATFORMS]}


@app.get("/api/creators")
def creators() -> list[dict]:
    return [{**_profile(c), "data_issues": _data_issues(c["creator_id"])} for c in data.creators().values()]


@lru_cache
def _data_issues(creator_id: str) -> tuple:
    """Months with records that can't be converted yet (lets the UI flag the creator)."""
    c = data.creators()[creator_id]
    out = []
    for m in c.get("active_months", []):
        issues = _book(c, [m])["issues"]
        if issues:
            out.append({"month": m, "count": len(issues), "currency": issues[0]["currency"], "date": issues[0]["date"],
                        "platform": issues[0]["platform"]})
    return tuple(out)


@app.get("/api/overview")
def overview(creator: str, month: str) -> dict:
    c, month = _creator(creator), _month(month)
    book = _book(c, [month])
    prev_month = _previous(month)
    prev = _book(c, [prev_month])
    total = book["total"]
    platforms = _platform_rows(book)
    # A month with no income after the creator started compares against 0; before that there is nothing to compare.
    active = c.get("active_months") or []
    has_prev = bool(prev["per"]) or bool(active and prev_month >= min(active))
    rate = ledger.D(c["set_aside_rate"])
    return {"creator": _profile(c), "month": month, "currency": "USD",
            "complete": not book["issues"], "issues": book["issues"],
            "totals": _m(total), "platforms": platforms, "best_keep_rate": _best(platforms),
            "month_over_month": {
                "previous_month": prev_month,
                "previous_net": ledger.cents(prev["total"]["net"]) if has_prev else None,
                "change": ledger.cents(total["net"] - prev["total"]["net"]) if has_prev else None,
                "change_pct": _ratio(total["net"] - prev["total"]["net"], prev["total"]["net"]) if has_prev else None,
                "previous_complete": not prev["issues"]},
            "set_aside": {"rate": float(rate), "amount": ledger.cents(total["net"] * rate),
                          "base": "net income in USD", "note": DISCLAIMER}}


@app.get("/api/ledger")
def ledger_view(creator: str, month: str) -> dict:
    c, month = _creator(creator), _month(month)
    book = _book(c, [month])
    return {"creator": _profile(c), "month": month, "currency": "USD",
            "complete": not book["issues"], "issues": book["issues"],
            "rows": book["rows"], "totals": _m(book["total"]), "waterfall": _waterfall(book["total"])}


@app.get("/api/tax-items")
def tax_items(creator: str, period: str, after: str | None = None) -> dict:
    c, months = _creator(creator), _months(period)
    return _tax(c, months, period, _day(after) if after else date.today().isoformat())


@app.get("/api/forms")
def forms(creator: str, period: str) -> dict:
    """Tax forms vs what landed: what each platform's form would show, the gap, threshold and duplicates."""
    c, months = _creator(creator), _months(period)
    return {"creator": _profile(c), "period": period, "currency": "USD",
            **ledger.form_check(c, months, skip_missing=True), "note": DISCLAIMER}


@app.get("/api/report")
def report(creator: str, period: str, after: str | None = None) -> dict:
    c, months = _creator(creator), _months(period)
    after = _day(after) if after else date.today().isoformat()
    book = _book(c, months)
    platforms = _platform_rows(book)
    by_month = []
    for m in months:
        mb = _book(c, [m])
        by_month.append({"month": m, **_m(mb["total"]), "complete": not mb["issues"],
                         "platforms": len(mb["per"])})
    fx_used = sorted({(r["fx"]["currency"], r["fx"]["rate_date"], r["fx"]["rate"]) for r in book["rows"] if r["fx"]})
    return {"title": f"Side income report — {c['name']} — {period}", "creator": _profile(c), "period": period,
            "months": months, "generated_on": date.today().isoformat(), "currency": "USD",
            "complete": not book["issues"], "issues": book["issues"],
            "totals": _m(book["total"]), "waterfall": _waterfall(book["total"]),
            "by_month": by_month, "by_platform": platforms, "best_keep_rate": _best(platforms),
            "fx_used": [{"currency": cur, "date": d, "rate": rate} for cur, d, rate in fx_used],
            "tax": _tax(c, months, period, after),
            "assumptions_note": ledger.assumptions().get("note"), "disclaimer": DISCLAIMER}


# ---------------------------------------------------------------- ask (the agent)

class AskRequest(BaseModel):
    question: str
    creator: str | None = None


_client = None


def _nicrron():
    global _client
    if _client is None:
        _client = nicrron_client()
    return _client


def _step_event(step: dict) -> dict:
    if step["type"] == "llm":
        return {"type": "llm", "name": step["name"], "status": step["status"], "tool_calls": step["tool_calls"],
                "text": step["text"][:2000], "duration_ms": step["duration_ms"]}
    result = step["result"]
    try:
        parsed = json.loads(result) if len(result) <= 6000 else None
    except json.JSONDecodeError:
        parsed = None
    return {"type": "tool", "name": step["name"], "args": step["args"], "status": step["status"],
            "error": step["error"], "result_summary": result[:300], "result": parsed,
            "duration_ms": step["duration_ms"]}


@app.post("/api/ask")
def ask(req: AskRequest) -> StreamingResponse:
    question = req.question.strip()
    if not question:
        raise HTTPException(422, "question is empty")
    if req.creator:
        c = _creator(req.creator)
        question = f"[Creator: {c['name']} ({c['creator_id']})] {question}"
    events: queue.Queue = queue.Queue()

    def work() -> None:
        state: dict = {}
        counter = iter(range(1, 10_000))
        agent = None
        try:
            agent = TracedAgent(agent_id="daoshou-v2", agent_name="daoshou-v2", version="v2", model=default_model(),
                                system=agent_v2.SYSTEM, tools=agent_v2.TOOLS, client=_nicrron())
            res = agent.run(question, session_id=f"ask-{uuid.uuid4().hex[:8]}",
                            metadata={"source": "api/ask", "creator_id": req.creator},
                            tool_impls=agent_v2.make_tools(state),
                            on_step=lambda s: events.put(("step", {"i": next(counter), **_step_event(s)})))
            sub = state.get("submitted") or {}
            events.put(("answer", {"answer": sub.get("answer"), "unit": sub.get("unit"),
                                   "explanation": sub.get("explanation"), "text": res["output"]}))
            events.put(("done", {"trace_id": res["trace_id"], "session_id": res["session_id"],
                                 "failed": res["failed"], "error": res["error"], "tool_steps": res["tool_steps"],
                                 "prism_hint": "PRISM → Sessions, search for this session_id"}))
        except Exception as e:
            events.put(("error", {"message": f"{type(e).__name__}: {e}"}))
            events.put(("done", {"failed": True}))
        finally:
            if agent is not None:
                agent.close()
            events.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        while (item := events.get()) is not None:
            name, payload = item
            yield f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# Static front end, once it exists (mounted last so /api routes win).
WEB = ROOT / "web"
if WEB.is_dir():
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")

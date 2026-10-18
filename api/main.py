"""Side Pocket HTTP API.

Every number comes from daoshou/ledger.py (deterministic Decimal math). The model only
runs in POST /api/ask, which streams the v2 agent's steps as Server-Sent Events and is
traced into PRISM like any other run. The GET endpoints read the bundled demo creators;
api/personal.py serves the same pages from statements a user uploads, keeping nothing. A record whose date has no exchange rate is never
estimated: it is left out of the totals and reported under `issues`, with `complete: false`.

    .venv/bin/uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
import queue
import threading
import time
import uuid
from datetime import date
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

from api import personal, views  # noqa: E402
from daoshou import agent_v2, bookkeeping, data, ledger  # noqa: E402
from daoshou.prism_tracing import TracedAgent, default_model, nicrron_client  # noqa: E402

app = FastAPI(title="Side Pocket API", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
personal.install(app)  # POST /api/personal/*: the same pages from statements the user uploads

def _creator(creator_id: str) -> dict:
    c = data.find_creator(creator_id)
    if c is None:
        raise HTTPException(404, f"no creator {creator_id!r}")
    return c


# ---------------------------------------------------------------- read endpoints

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model": default_model(), "creators": len(data.creators()),
            "platforms": [ledger.LABEL[p] for p in ledger.PLATFORMS]}


@app.get("/api/creators")
def creators() -> list[dict]:
    return [{**views.profile(c), "data_issues": _data_issues(c["creator_id"])} for c in data.creators().values()]


@lru_cache
def _data_issues(creator_id: str) -> tuple:
    """Months with records that can't be converted yet (lets the UI flag the creator)."""
    c = data.creators()[creator_id]
    out = []
    for m in c.get("active_months", []):
        issues = views.book(c, [m])["issues"]
        if issues:
            out.append({"month": m, "count": len(issues), "currency": issues[0]["currency"], "date": issues[0]["date"],
                        "platform": issues[0]["platform"]})
    return tuple(out)


@app.get("/api/overview")
def overview(creator: str, month: str) -> dict:
    return views.overview(_creator(creator), views.check_month(month))


@app.get("/api/ledger")
def ledger_view(creator: str, month: str) -> dict:
    return views.ledger_view(_creator(creator), views.check_month(month))


@app.get("/api/tax-items")
def tax_items(creator: str, period: str, after: str | None = None) -> dict:
    c, months = _creator(creator), views.check_months(period)
    return views.tax(c, months, period, views.check_day(after) if after else date.today().isoformat())


@app.get("/api/forms")
def forms(creator: str, period: str) -> dict:
    """Tax forms vs what landed: what each platform's form would show, the gap, threshold and duplicates."""
    return views.forms(_creator(creator), period, views.check_months(period))


@app.get("/api/report")
def report(creator: str, period: str, after: str | None = None) -> dict:
    c, months = _creator(creator), views.check_months(period)
    return views.report(c, period, months, views.check_day(after) if after else date.today().isoformat())


# ---------------------------------------------------------------- the sample account's own entries and goal

class DemoRequest(BaseModel):
    """The same pages for a demo creator, with the entries and goal this browser keeps for them.

    `entries` replaces the creator's fixture list (the browser starts from GET /api/entries and adds,
    edits or removes); `monthly_goal` replaces the fixture goal (null = no goal). Notes stay in the
    browser and are ignored here, like on /api/personal/*.
    """
    creator: str
    month: str | None = None
    period: str | None = None
    after: str | None = None
    entries: list = []
    monthly_goal: dict | None = None


def _own(req: DemoRequest) -> dict:
    c = _creator(req.creator)
    entries, _ = bookkeeping.parse(req.entries, today=date.today())
    goal = None
    if req.monthly_goal is not None:
        currency = str(req.monthly_goal.get("currency", "USD")).upper()
        try:
            amount = ledger.D(str(req.monthly_goal.get("amount")))
        except Exception:
            raise HTTPException(422, "monthly_goal.amount must be a number") from None
        if not amount.is_finite() or amount <= 0 or amount > 10_000_000 or currency not in ("USD", "CNY"):
            raise HTTPException(422, "monthly_goal needs an amount above 0 and currency USD or CNY")
        goal = {"amount": amount, "currency": currency}
    return {**c, "entries": entries, "monthly_goal": goal}


@app.get("/api/entries")
def demo_entries(creator: str) -> dict:
    """A demo creator's fictional manual entries and monthly goal (the starting list for the browser)."""
    _creator(creator)
    spec = bookkeeping._fixture().get(creator) or {}
    return {"creator": creator, "entries": spec.get("entries", []), "monthly_goal": spec.get("monthly_goal")}


@app.post("/api/overview")
def overview_own(req: DemoRequest) -> dict:
    return views.overview(_own(req), views.check_month(req.month or ""))


@app.post("/api/ledger")
def ledger_own(req: DemoRequest) -> dict:
    return views.ledger_view(_own(req), views.check_month(req.month or ""))


@app.post("/api/report")
def report_own(req: DemoRequest) -> dict:
    c, months = _own(req), views.check_months(req.period or "")
    return views.report(c, req.period, months, views.check_day(req.after) if req.after else date.today().isoformat())


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


REPLAY = ROOT / "web" / "demo" / "ask-c01-sep.json"


def _replay_stream() -> StreamingResponse:
    """No model key (e.g. the public deployment): stream a recorded real traced run, paced like a live one."""
    recording = json.loads(REPLAY.read_text(encoding="utf-8"))

    def stream():
        for name, payload in recording["events"]:
            if name == "done":
                payload = {**payload, "replay": True, "recorded_question": recording["question"]}
            yield f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"
            time.sleep(0.35 if name == "step" else 0.1)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/ask")
def ask(req: AskRequest) -> StreamingResponse:
    question = req.question.strip()
    if not question:
        raise HTTPException(422, "question is empty")
    if not os.environ.get("NICRRON_API_KEY"):
        return _replay_stream()
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
                            on_step=lambda s: events.put(("step", {"i": next(counter), **views.step_event(s)})),
                            no_answer=lambda: (state.get("submitted") or {}).get("answer") in (None, "", "null"))
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

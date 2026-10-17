"""Bring your own statements: the same pages as the demo, computed from files the user uploads.

The browser keeps the files (IndexedDB) and sends them with every request. The server parses them
in memory, answers, and keeps nothing:
- no database, no files written: bodies are JSON (multipart would spool large uploads to a temp file);
- every response is `Cache-Control: no-store`;
- nothing from a request is logged: inputs travel in the body, never in the URL, so access logs see
  only the path; validation errors don't echo the input back; an unexpected error is reported by
  its class name only;
- bodies over MAX_BODY bytes are refused (Vercel's own limit is 4.5 MB);
- the only outbound calls are ECB reference rates (currency codes and a date range, see
  daoshou/fx.py) and, for /ask, the model (totals only) and PRISM (content-free).

    GET  /api/personal/formats    how files are recognised (static, no user data)
    POST /api/personal/detect     what each file is
    POST /api/personal/overview   one month          (month)
    POST /api/personal/ledger     one month's records (month)
    POST /api/personal/tax-items  a month or period  (period, after)
    POST /api/personal/forms      a month or period  (period)
    POST /api/personal/report     a month or period  (period, after)
    POST /api/personal/ask        Server-Sent Events, like /api/ask
"""
from __future__ import annotations

import json
import os
import queue
import sys
import threading
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from api import views
from daoshou import agent_personal, ledger, statements, tax_home
from daoshou.prism_tracing import TracedAgent, default_model, nicrron_client

PREFIX = "/api/personal"
MAX_BODY = 4_000_000
MAX_FILES = 40
NO_STORE = [(b"cache-control", b"no-store, max-age=0"), (b"pragma", b"no-cache")]

router = APIRouter(prefix=PREFIX)


# ---------------------------------------------------------------- request

class StatementFile(BaseModel):
    name: str = Field(max_length=200)
    content: str | None = None          # the file as text
    content_base64: str | None = None   # or its bytes, e.g. a statement saved as GB18030


class PersonalRequest(BaseModel):
    files: list[StatementFile] = Field(min_length=1, max_length=MAX_FILES)
    tax_home: Literal["US", "CN", "BOTH"] = "US"
    currency: Literal["USD", "CNY"] = "USD"
    set_aside_rate: float = Field(0.25, ge=0, le=0.6)
    payout_methods: dict[str, str] = Field(default_factory=dict, description="platform -> e.g. PayPal")
    reference_rates: bool = True        # False: only rate files you upload are used
    month: str | None = None            # overview, ledger (default: the latest month in the files)
    period: str | None = None           # tax-items, forms, report (default: that month's quarter)
    after: str | None = None            # deadlines after this date (default: today)

    @field_validator("payout_methods")
    @classmethod
    def _platforms(cls, value: dict[str, str]) -> dict[str, str]:
        out = {}
        for platform, method in value.items():
            try:
                out[ledger.platform_key(platform)] = method.strip()[:40]
            except ValueError:
                raise ValueError(f"unknown platform {platform!r}") from None
        return out


class PersonalAsk(PersonalRequest):
    question: str = Field(max_length=2000)


# ---------------------------------------------------------------- helpers

def _load(req: PersonalRequest) -> tuple[statements.Upload, dict]:
    files = []
    for f in req.files:
        try:
            files.append((f.name, statements.decode(f.content, f.content_base64)))
        except ValueError as e:
            raise HTTPException(422, f"{f.name}: {e}") from None
    upload = statements.read(files, currency=req.currency, reference_rates=req.reference_rates)
    if not any(f.records for f in upload.statements()):
        raise HTTPException(422, {"message": "None of these files is a statement Side Atlas can read.",
                                  "import": upload.summary()})
    c = statements.profile(upload, tax_home=req.tax_home, set_aside_rate=req.set_aside_rate,
                           payout_methods=req.payout_methods)
    return upload, c


def _month(req: PersonalRequest, upload: statements.Upload) -> str:
    return views.check_month(req.month) if req.month else upload.months()[-1]


def _period(req: PersonalRequest, upload: statements.Upload) -> tuple[str, list[str]]:
    if req.period:
        return req.period, views.check_months(req.period)
    latest = upload.months()[-1]
    period = f"{latest[:4]}-Q{(int(latest[5:]) - 1) // 3 + 1}"
    return period, ledger.months_in(period)


def _after(req: PersonalRequest) -> str:
    return views.check_day(req.after) if req.after else date.today().isoformat()


def _settings(req: PersonalRequest) -> dict:
    return {"tax_home": req.tax_home, "currency": req.currency, "set_aside_rate": req.set_aside_rate,
            "payout_methods": req.payout_methods, "reference_rates": req.reference_rates}


def _wrap(out: dict, upload: statements.Upload, req: PersonalRequest) -> dict:
    return {**out, "import": upload.summary(), "settings": _settings(req)}


def _tax(c: dict, months: list[str], period: str, after: str, req: PersonalRequest) -> dict:
    """The demo tax page plus what the tax home adds: deadlines and items per country, and labels."""
    homes = tax_home.HOMES[req.tax_home]
    # From a US-and-China home the shared accountant list takes the US view; the China section adds its own.
    out = views.tax({**c, "tax_country": homes[0]}, months, period, after, req.currency)
    out["creator"] = views.profile(c)
    out["set_aside"]["rate_source"] = "chosen by you"
    sfx = req.currency.lower()
    withheld = [{"platform": r["platform"], "country": r["country"], "amount": r[f"withheld_{sfx}"],
                 "amount_cny": r.get("withheld_cny", r[f"withheld_{sfx}"] if req.currency == "CNY" else None)}
                for r in out["tax_withheld_by_platform"]]
    recs = [r for m in months for p in ledger.PLATFORMS for r in ledger.records(c, p, m)]
    seen = sorted({ledger.LABEL[r.platform] for r in recs})
    out["tax_home"] = req.tax_home
    out["by_country"] = tax_home.sections(tax_home=req.tax_home, months=months, after=after, withheld=withheld,
                                          platforms_seen=seen, currency=req.currency,
                                          has_cny_income=any(r.currency == "CNY" for r in recs))
    if "US" in homes:
        due = tax_home.next_us_estimated_tax_due(after)
        out["next_us_estimated_tax_due"] = {
            "after": after, "due_date": due,
            "days_left": (date.fromisoformat(due) - date.fromisoformat(after)).days if due else None,
            "schedule": tax_home.us_estimated_tax_due_dates(int(months[-1][:4]))}
    else:
        out["next_us_estimated_tax_due"] = None
        out["forms"] = {"applies": False, "note": "US tax forms (1099) are for US taxpayers. With a China tax "
                                                  "home, platforms outside China usually ask for a W-8BEN instead."}
    out["assumptions"] = tax_home.assumptions(req.tax_home)
    return out


# ---------------------------------------------------------------- endpoints

@router.get("/formats")
def formats() -> dict:
    """How files are recognised, so the browser can relabel the account column before uploading."""
    return {**statements.formats(), "limits": {"max_files": MAX_FILES, "max_body_bytes": MAX_BODY,
                                               "max_skipped_rows_listed": statements.MAX_SKIPPED}}


@router.post("/detect")
def detect(req: PersonalRequest) -> dict:
    files = []
    for f in req.files:
        try:
            files.append((f.name, statements.decode(f.content, f.content_base64)))
        except ValueError as e:
            raise HTTPException(422, f"{f.name}: {e}") from None
    upload = statements.read(files, currency=req.currency, reference_rates=False)
    return {"import": upload.summary(), "settings": _settings(req)}


@router.post("/overview")
def overview(req: PersonalRequest) -> dict:
    upload, c = _load(req)
    return _wrap(views.overview(c, _month(req, upload), req.currency), upload, req)


@router.post("/ledger")
def ledger_view(req: PersonalRequest) -> dict:
    upload, c = _load(req)
    return _wrap(views.ledger_view(c, _month(req, upload), req.currency), upload, req)


@router.post("/tax-items")
def tax_items(req: PersonalRequest) -> dict:
    upload, c = _load(req)
    period, months = _period(req, upload)
    return _wrap(_tax(c, months, period, _after(req), req), upload, req)


@router.post("/forms")
def forms(req: PersonalRequest) -> dict:
    upload, c = _load(req)
    period, months = _period(req, upload)
    if "US" not in tax_home.HOMES[req.tax_home]:
        out = {"creator": views.profile(c), "period": period, "applies": False,
               "note": "US tax forms (1099) are for US taxpayers. With a China tax home, platforms outside China "
                       "usually ask for a W-8BEN instead."}
    else:
        out = views.forms(c, period, months)
    return _wrap(out, upload, req)


@router.post("/report")
def report(req: PersonalRequest) -> dict:
    upload, c = _load(req)
    period, months = _period(req, upload)
    after = _after(req)
    out = views.report(c, period, months, after, req.currency)
    out["tax"] = _tax(c, months, period, after, req)
    return _wrap(out, upload, req)


_client = None


def _nicrron():
    global _client
    if _client is None:
        _client = nicrron_client()
    return _client


@router.post("/ask")
def ask(req: PersonalAsk) -> StreamingResponse:
    question = req.question.strip()
    if not question:
        raise HTTPException(422, "question is empty")
    if not os.environ.get("NICRRON_API_KEY"):
        raise HTTPException(503, "Ask Atlas isn't available on this server because it has no model key. "
                                 "Every other page works without one.")
    if not os.environ.get("PRISMTRACE_API_KEY") or not os.environ.get("PRISMTRACE_PROJECT_ID"):
        raise HTTPException(503, "Ask Atlas isn't available on this server because run tracing isn't set up.")
    upload, c = _load(req)
    events: queue.Queue = queue.Queue()

    def work() -> None:
        state: dict = {}
        counter = iter(range(1, 10_000))
        agent = None
        try:
            agent = TracedAgent(agent_id="side-atlas-personal", agent_name="side-atlas-personal",
                                version="v2-personal", model=default_model(), system=agent_personal.SYSTEM,
                                tools=agent_personal.TOOLS, client=_nicrron(), content_free=True)
            tools = agent_personal.make_tools(c, currency=req.currency, home=req.tax_home,
                                              today=date.today().isoformat(), state=state)
            res = agent.run(question, session_id=f"personal-{uuid.uuid4().hex[:8]}",
                            metadata={"source": "api/personal/ask", "content_free": True}, tool_impls=tools,
                            on_step=lambda s: events.put(("step", {"i": next(counter), **views.step_event(s)})),
                            no_answer=lambda: (state.get("submitted") or {}).get("answer") in (None, "", "null"))
            sub = state.get("submitted") or {}
            events.put(("answer", {"answer": sub.get("answer"), "unit": sub.get("unit"),
                                   "explanation": sub.get("explanation"), "text": res["output"]}))
            events.put(("done", {"trace_id": res["trace_id"], "session_id": res["session_id"],
                                 "failed": res["failed"], "error": res["error"], "tool_steps": res["tool_steps"],
                                 "content_free": True}))
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

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


# ---------------------------------------------------------------- privacy guard

class _Guard:
    """For /api/personal/*: cap the body, mark responses no-store, and keep errors free of content."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith(PREFIX + "/"):
            return await self.app(scope, receive, send)
        length = dict(scope["headers"]).get(b"content-length")
        if length and length.isdigit() and int(length) > MAX_BODY:
            return await _json(send, 413, _too_large())
        received, started = 0, False

        async def capped_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_BODY:
                    raise HTTPException(413, _too_large())
            return message

        async def no_store_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() not in (b"cache-control",
                                                                                               b"pragma")]
                message = {**message, "headers": headers + NO_STORE}
            await send(message)

        try:
            await self.app(scope, capped_receive, no_store_send)
        except Exception as e:  # don't let a traceback carry anything from the files into the logs
            print(f"{scope['path']}: {type(e).__name__}", file=sys.stderr)
            if not started:
                await _json(no_store_send, 500, "Something went wrong reading these statements. Nothing was saved.")


def _too_large() -> str:
    return f"These files add up to more than {MAX_BODY // 1_000_000} MB. Upload fewer at a time."


async def _json(send, status: int, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
                            *NO_STORE]})
    await send({"type": "http.response.body", "body": body})


async def _validation_error(request: Request, exc: RequestValidationError):
    if not request.url.path.startswith(PREFIX + "/"):
        return await request_validation_exception_handler(request, exc)
    errors = [{k: v for k, v in e.items() if k not in ("input", "ctx", "url")} for e in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


def install(app: FastAPI) -> None:
    app.include_router(router)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_middleware(_Guard)

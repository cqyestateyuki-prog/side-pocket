"""What the server promises about uploaded statements, and Ask Atlas over them."""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from api import personal, views
from conftest import request_for
from daoshou import prism_tracing

ACCOUNT_IDS = ["bili_330121", "UC-yzl-moonspirit", "yuezhiling_tv", "moonspirit_design", "moonspirit_studio"]


def test_responses_are_never_cached(client):
    ok = client.post("/api/personal/overview", json=request_for("C01", month="2026-09"))
    bad = client.post("/api/personal/overview", json={"files": []})
    for r in (ok, bad):
        assert r.headers["cache-control"] == "no-store, max-age=0" and r.headers["pragma"] == "no-cache"
    assert "no-store" not in client.get("/api/overview", params={"creator": "C01", "month": "2026-09"}).headers.get(
        "cache-control", "")


def test_validation_errors_do_not_echo_the_files(client):
    r = client.post("/api/personal/overview", json={"files": [{"name": "a.csv", "content": "secret"}],
                                                    "set_aside_rate": 5})
    assert r.status_code == 422 and "secret" not in r.text and "input" not in r.json()["detail"][0]


def test_body_over_the_limit_is_refused(client):
    big = "x" * (personal.MAX_BODY + 1)
    r = client.post("/api/personal/overview", content=json.dumps({"files": [{"name": "a", "content": big}]}),
                    headers={"content-type": "application/json"})
    assert r.status_code == 413 and r.headers["cache-control"].startswith("no-store")


def test_unexpected_errors_carry_no_content(client, monkeypatch, capsys):
    def boom(*_a, **_k):
        raise ValueError("bili_330121 earned 1016.00")
    monkeypatch.setattr(views, "overview", boom)
    r = client.post("/api/personal/overview", json=request_for("C01", month="2026-09"))
    logged = capsys.readouterr()
    assert r.status_code == 500 and "bili_330121" not in r.text
    assert "bili_330121" not in logged.out + logged.err and "ValueError" in logged.err


def test_ask_without_a_model_key_says_so(client, monkeypatch):
    monkeypatch.delenv("NICRRON_API_KEY", raising=False)
    r = client.post("/api/personal/ask", json=request_for("C01", question="How much did I make in September?"))
    assert r.status_code == 503 and "model key" in r.json()["detail"]


# ---------------------------------------------------------------- ask: totals to the model, no content to PRISM

def _call(name, args, i):
    return SimpleNamespace(id=f"call_{i}", function=SimpleNamespace(name=name, arguments=json.dumps(args)))


class FakeModel:
    """Plays a fixed tool sequence and keeps every message it was sent."""

    def __init__(self, plan):
        self.plan, self.seen = list(plan), []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, *, model, messages, tools, temperature):
        self.seen.append(json.dumps(messages, ensure_ascii=False, default=str))
        step = self.plan.pop(0)
        msg = SimpleNamespace(content=step if isinstance(step, str) else None,
                              tool_calls=None if isinstance(step, str) else
                              [_call(n, a, len(self.plan)) for n, a in step])
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)],
                               usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5))


@pytest.fixture
def traced(monkeypatch):
    monkeypatch.setenv("NICRRON_API_KEY", "test")
    monkeypatch.setenv("PRISMTRACE_API_KEY", "test")
    monkeypatch.setenv("PRISMTRACE_PROJECT_ID", "test-project")
    posts = []
    monkeypatch.setattr(prism_tracing.TracedAgent, "_post", lambda self, path, payload: posts.append((path, payload)))
    return posts


def _ask(client, monkeypatch, plan, **extra):
    model = FakeModel(plan)
    monkeypatch.setattr(personal, "_nicrron", lambda: model)
    r = client.post("/api/personal/ask", json=request_for("C01", **extra))
    events = [(e.split("\n")[0][7:], json.loads(e.split("\n")[1][6:])) for e in r.text.strip().split("\n\n")]
    return r, model, events


QUESTION = "I'm Moon Spirit (bili_330121). How much did I keep in September 2026?"


def test_ask_sends_totals_only_and_traces_content_free(client, monkeypatch, traced):
    plan = [[("get_summary", {})], [("compute_breakdown", {"month": "2026-09"})],
            [("tax_items", {"period": "2026-Q3", "after_date": "2026-09-01"}), ("form_check", {"period": "2026-Q3"})],
            [("submit_answer", {"answer": 5341.79, "unit": "USD"})], "You kept $5,341.79."]
    r, model, events = _ask(client, monkeypatch, plan, question=QUESTION)
    assert r.headers["cache-control"].startswith("no-store")
    names = [n for n, _ in events]
    assert names[-2:] == ["answer", "done"] and "error" not in names
    assert events[-2][1]["answer"] == 5341.79 and events[-1][1]["failed"] is False

    tool_output = "".join(model.seen[1:])  # everything after the first call is tool results
    for secret in ACCOUNT_IDS + ["FO226285", "UW-2101", "Lumen Studio", "2026-09-16"]:
        assert secret not in tool_output.replace(QUESTION, ""), secret

    sent = json.dumps([p for _, p in traced], ensure_ascii=False)
    assert [path for path, _ in traced] == ["/api/traces", "/api/spans/ingest", "/api/trajectories"]
    assert traced[0][1]["content_free"] is True and traced[1][1]["content_free"] is True
    for secret in ["Moon Spirit", "bili_330121", "5341.79", "5,341.79", "September"]:
        assert secret not in sent, secret
    assert traced[0][1]["output_message"] == prism_tracing.ANSWERED
    assert {s["name"] for s in traced[1][1]["spans"]} >= {"get_summary", "compute_breakdown", "form_check"}


def test_missing_rate_fails_the_run_with_only_its_kind_traced(client, monkeypatch, traced):
    req = request_for("C11")
    plan = [[("compute_breakdown", {"month": "2026-08"})],
            [("submit_answer", {"answer": None, "unit": "USD"})], "The EUR rate for 21 August is missing."]
    model = FakeModel(plan)
    monkeypatch.setattr(personal, "_nicrron", lambda: model)
    r = client.post("/api/personal/ask", json={**req, "question": "August net?"})
    done = json.loads(r.text.strip().split("\n\n")[-1].split("\n")[1][6:])
    assert done["failed"] is True
    trace = traced[0][1]
    assert trace["output_message"] == ""  # no answer: counts toward PRISM's error rate
    assert trace["metadata"]["status"] == "error"
    assert trace["metadata"]["error_message"] == "compute_breakdown: MissingFXRate"
    assert "2026-08-21" not in json.dumps([p for _, p in traced])


def test_tracing_without_content_free_is_unchanged(monkeypatch, traced):
    agent = prism_tracing.TracedAgent(agent_id="t", agent_name="t", version="v", model="m", system="s", tools=[],
                                      client=FakeModel(["plain answer"]))
    agent.run("plain question")
    trace = traced[0][1]
    assert trace["input_messages"][0]["content"] == "plain question" and trace["output_message"] == "plain answer"
    assert "content_free" not in trace

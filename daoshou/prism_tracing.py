"""PRISM tracing for an OpenAI-compatible tool-calling loop (Nicrron API).

prismtrace-sdk ships ClaudeAgentTracer for Anthropic-native clients but nothing
for OpenAI-style `tool_calls`, so this mirrors its payloads: one run emits
spans to /api/spans/ingest (Sessions -> Steps tab) and a trajectory to
/api/trajectories (evaluation, Root Cause). A tool that raises is recorded as
an error step, which is what PRISM alerts and failure clusters key on.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

import httpx
from openai import OpenAI
from prismtrace import resolve_session


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def nicrron_client() -> OpenAI:
    return OpenAI(
        base_url=os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.ai/v1"),
        api_key=os.environ["NICRRON_API_KEY"],
    )


class ToolError(Exception):
    """Raised by a tool to mark its step as failed in PRISM."""


class TracedAgent:
    def __init__(
        self,
        *,
        agent_id: str,
        agent_name: str,
        version: str,
        model: str,
        system: str,
        tools: list[dict],
        tool_impls: dict[str, Callable[..., Any]],
        temperature: float = 0,
        client: OpenAI | None = None,
    ):
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.version = version
        self.model = model
        self.system = system
        self.tools = tools
        self.tool_impls = tool_impls
        self.temperature = temperature
        self.client = client or nicrron_client()
        self.project_id = os.environ["PRISMTRACE_PROJECT_ID"]
        self._http = httpx.Client(
            base_url=os.environ.get("PRISMTRACE_HOST", "https://api.prism.blockconvey.com"),
            headers={"x-prismtrace-key": os.environ["PRISMTRACE_API_KEY"]},
            timeout=30,
        )

    def _call_tool(self, name: str, args: dict) -> tuple[str, str | None]:
        fn = self.tool_impls.get(name)
        if fn is None:
            return json.dumps({"error": f"unknown tool {name}"}), f"unknown tool {name}"
        try:
            result = fn(**args)
            return (result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)), None
        except Exception as e:  # surfaced to the model and recorded as a failed step
            return json.dumps({"error": str(e)}, ensure_ascii=False), f"{type(e).__name__}: {e}"

    def run(self, user_input: str, *, session_id: str | None = None, max_iterations: int = 15,
            metadata: dict | None = None) -> dict:
        trace_id = str(uuid.uuid4())
        session = resolve_session(session_id, str(uuid.uuid4()))
        root_id = str(uuid.uuid4())
        meta = {"agent_version": self.version, **(metadata or {})}
        spans: list[dict] = []
        steps: list[dict] = []
        messages: list[dict] = [{"role": "system", "content": self.system},
                                {"role": "user", "content": user_input}]
        run_start, t_run = _now(), time.perf_counter()
        final_text = ""
        tokens_in = tokens_out = 0

        for iteration in range(1, max_iterations + 1):
            llm_start, t0 = _now(), time.perf_counter()
            resp = self.client.chat.completions.create(
                model=self.model, messages=messages, tools=self.tools,
                temperature=self.temperature,
            )
            dur = (time.perf_counter() - t0) * 1000
            msg = resp.choices[0].message
            usage = resp.usage
            ti, to = (usage.prompt_tokens, usage.completion_tokens) if usage else (0, 0)
            tokens_in, tokens_out = tokens_in + ti, tokens_out + to
            tool_calls = msg.tool_calls or []
            spans.append({
                "span_id": str(uuid.uuid4()), "parent_span_id": root_id,
                "name": f"llm:{self.model}", "span_type": "llm",
                "input_text": json.dumps(messages[-3:], ensure_ascii=False, default=str),
                "output_text": msg.content or json.dumps([tc.function.name for tc in tool_calls]),
                "metadata": {"iteration": iteration, **meta},
                "start_time": llm_start, "end_time": _now(), "duration_ms": dur, "status": "ok",
                "token_count_input": ti, "token_count_output": to, "model": self.model,
            })
            steps.append({
                "step_type": "reasoning" if tool_calls else "final_answer",
                "label": f"LLM call (iteration {iteration})",
                "output_summary": (msg.content or ", ".join(tc.function.name for tc in tool_calls))[:200],
                "duration_ms": int(dur), "token_count": ti + to, "status": "success",
            })
            if not tool_calls:
                final_text = msg.content or ""
                break

            messages.append({"role": "assistant", "content": msg.content, "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in tool_calls]})
            for tc in tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                tool_start, t1 = _now(), time.perf_counter()
                result, error = self._call_tool(tc.function.name, args)
                tdur = (time.perf_counter() - t1) * 1000
                spans.append({
                    "span_id": str(uuid.uuid4()), "parent_span_id": root_id,
                    "name": tc.function.name, "span_type": "tool",
                    "input_text": tc.function.arguments, "output_text": result[:10000],
                    "metadata": {"tool_call_id": tc.id, **meta},
                    "start_time": tool_start, "end_time": _now(), "duration_ms": tdur,
                    "status": "error" if error else "ok", "error_message": error,
                })
                steps.append({
                    "step_type": "tool_call", "label": tc.function.name, "tool_name": tc.function.name,
                    "input_summary": (tc.function.arguments or "")[:200], "output_summary": result[:200],
                    "duration_ms": int(tdur), "token_count": 0,
                    "status": "error" if error else "success",
                })
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

        failed = any(s["status"] == "error" for s in steps)
        total_ms = (time.perf_counter() - t_run) * 1000
        spans.insert(0, {
            "span_id": root_id, "parent_span_id": None, "name": f"{self.agent_name}:{self.version}",
            "span_type": "chain", "input_text": user_input[:10000], "output_text": final_text[:10000],
            "metadata": {"iterations": iteration, "model": self.model, **meta},
            "start_time": run_start, "end_time": _now(), "duration_ms": total_ms,
            "status": "error" if failed else "ok",
        })
        self._post("/api/spans/ingest", {"trace_id": trace_id, "project_id": self.project_id,
                                         "session_id": session, "spans": spans})
        # One /api/traces record per run so model, tokens and cost show up in Traces.
        self._post("/api/traces", {
            "project_id": self.project_id, "trace_id": trace_id, "model": self.model,
            "input_messages": [{"role": "user", "content": user_input}], "output_message": final_text,
            "latency_ms": int(total_ms), "token_count_input": tokens_in, "token_count_output": tokens_out,
            "agent_id": self.agent_id, "agent_name": self.agent_name, "session_id": session,
            "metadata": {**meta, "final_status": "error" if failed else "success"},
        })
        traj = self._post("/api/trajectories", {
            "project_id": self.project_id, "conversation_id": session, "request_id": trace_id,
            "agent_id": self.agent_id, "agent_name": self.agent_name, "steps": steps,
            "total_duration_ms": int(total_ms), "final_status": "error" if failed else "success",
            "model": self.model,
        })
        return {"output": final_text, "trace_id": trace_id, "session_id": session,
                "trajectory_id": (traj or {}).get("id"), "failed": failed,
                "tool_steps": sum(s["step_type"] == "tool_call" for s in steps),
                "tokens": tokens_in + tokens_out}

    def _post(self, path: str, payload: dict) -> dict | None:
        try:
            r = self._http.post(path, json=payload)
            if r.status_code in (200, 201):
                return r.json()
            print(f"PRISM {path} -> {r.status_code}: {r.text[:300]}")
        except Exception as e:
            print(f"PRISM {path} failed: {e}")
        return None

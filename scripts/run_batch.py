"""Run test questions through an agent version, grade them, and trace every run into PRISM.

    .venv/bin/python scripts/run_batch.py --version v1 --pilot
    .venv/bin/python scripts/run_batch.py --version v1 --all --workers 6
    .venv/bin/python scripts/run_batch.py --version v2 --ids Q001,Q062

Each question is one PRISM session. Results go to results/<version>_<tag>.jsonl.
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from daoshou import agent_v1, agent_v2, data  # noqa: E402
from daoshou.grading import grade  # noqa: E402
from daoshou.prism_tracing import TracedAgent, default_model, nicrron_client  # noqa: E402

VERSIONS = {"v1": agent_v1, "v2": agent_v2}
# One question per behaviour worth checking before spending a full batch.
PILOT = ["Q001", "Q009", "Q015", "Q019", "Q062"]


def pick(args) -> list[dict]:
    qs = data.questions()
    if args.ids:
        wanted = set(args.ids.split(","))
        return [q for q in qs if q["id"] in wanted]
    if args.pilot:
        usd_only = next(q for q in qs if q["creator_id"] == "C03")
        return [q for q in qs if q["id"] in PILOT] + [usd_only]
    return qs


def run_one(q: dict, version: str, model: str, client, trace: bool) -> dict:
    module = VERSIONS[version]
    state: dict = {}
    agent = TracedAgent(agent_id=f"daoshou-{version}", agent_name=f"daoshou-{version}", version=version,
                        model=model, system=module.SYSTEM, tools=module.TOOLS, client=client, trace=trace)
    try:
        res = agent.run(
            q["question"], session_id=f"{version}-{q['id']}-{uuid.uuid4().hex[:6]}",
            metadata={"question_id": q["id"], "category": q["category"], "creator_id": q["creator_id"]},
            tool_impls=module.make_tools(state),
            grade=lambda _text, _errors: grade(q, state.get("submitted")),
        )
    finally:
        agent.close()
    submitted = state.get("submitted") or {}
    return {"id": q["id"], "version": version, "category": q["category"], "creator_id": q["creator_id"],
            "traps": q["v1_traps"], "expected": q["expected_answer"], "got": submitted.get("answer"),
            "ok": res["graded_ok"], "run_failed": res["failed"], "error": res["error"],
            "tool_steps": res["tool_steps"], "tokens_in": res["tokens_in"], "tokens_out": res["tokens_out"],
            "latency_ms": res["latency_ms"], "trace_id": res["trace_id"], "session_id": res["session_id"]}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--version", choices=list(VERSIONS), required=True)
    sel = p.add_mutually_exclusive_group(required=True)
    sel.add_argument("--ids")
    sel.add_argument("--pilot", action="store_true")
    sel.add_argument("--all", action="store_true")
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--model", default=default_model())
    p.add_argument("--tag", default=None)
    p.add_argument("--no-trace", action="store_true", help="dry run: do not send anything to PRISM")
    args = p.parse_args()

    qs = pick(args)
    tag = args.tag or ("pilot" if args.pilot else "all" if args.all else "ids")
    if args.no_trace:
        tag += "_dry"
    out = ROOT / "results" / f"{args.version}_{tag}.jsonl"
    out.parent.mkdir(exist_ok=True)
    print(f"{len(qs)} questions -> {args.version} on {args.model}, writing {out.relative_to(ROOT)}"
          f"{' (dry run, not traced)' if args.no_trace else ''}")

    client = nicrron_client()
    rows = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool, open(out, "w", encoding="utf-8") as f:
        futures = {pool.submit(run_one, q, args.version, args.model, client, not args.no_trace): q for q in qs}
        for fut in as_completed(futures):
            q = futures[fut]
            try:
                row = fut.result()
            except Exception as e:
                row = {"id": q["id"], "version": args.version, "category": q["category"], "traps": q["v1_traps"],
                       "ok": False, "run_failed": True, "error": f"HarnessError: {type(e).__name__}: {e}"}
            rows.append(row)
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            mark = "PASS" if row["ok"] else "FAIL"
            print(f"  {row['id']} {mark} {row['category']:24} steps={row.get('tool_steps')} "
                  f"got={row.get('got')!r} exp={row.get('expected')!r} {row.get('error') or ''}"[:220])

    passed = sum(r["ok"] for r in rows)
    tokens_in = sum(r.get("tokens_in") or 0 for r in rows)
    tokens_out = sum(r.get("tokens_out") or 0 for r in rows)
    print(f"\n{args.version}: {passed}/{len(rows)} correct, {sum(r['run_failed'] for r in rows)} runs failed in PRISM, "
          f"tokens in/out {tokens_in}/{tokens_out}")
    by_trap = collections.defaultdict(lambda: [0, 0])
    for r in rows:
        for t in r.get("traps", []):
            by_trap[t][0] += r["ok"]
            by_trap[t][1] += 1
    for t, (ok, n) in sorted(by_trap.items(), key=lambda kv: -kv[1][1]):
        print(f"  trap {t:18} {ok}/{n} correct")


if __name__ == "__main__":
    main()

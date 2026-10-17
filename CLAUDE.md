# 到手 Daoshou — MONEY TALKS 2 hackathon (2026-10-17, Money Operations track)

Requirements doc (Claude Docs): https://claude.ai/code/artifact/7f3d6563-ec85-4107-b1e8-05a89778cadf

## Setup
- Python venv: `.venv/` (Python 3.13). Run scripts with `.venv/bin/python`.
- Secrets live in `.env` (git-ignored); key names in `.env.example`.
- Model calls go through Nicrron (OpenAI-compatible, `NICRRON_BASE_URL`). The model is
  pinned in `.env` as `NICRRON_MODEL` (default `anthropic/claude-opus-5-5`; Fable 5.1 was used for the first v1/v2 PRISM runs), always at
  temperature 0, so v1/v2 runs are comparable; `nicrron/auto` re-routes between calls.
  `openai/gpt-6-astra` rejects tool calls on Nicrron.
- PRISM API notes: `docs/prism_api.md`. Paid PRISM endpoints spend workspace credits —
  quote the cost and ask before calling them.
- Use fictional data only.

## PRISM tracing (do not remove)

This project sends traces to PRISM. Env vars: `PRISMTRACE_API_KEY`,
`PRISMTRACE_PROJECT_ID`, `PRISMTRACE_HOST`.

Tracing is currently wired at: `daoshou/prism_tracing.py` (`TracedAgent`, used by `scripts/smoke_test.py`)

**Standing rule.** Whenever you add or change an agent, chain, graph, tool,
retriever, or any entry point that calls a model, wire it to PRISM before you
finish. Unwired code is invisible in the dashboard. If you are unsure whether
something is covered, assume it is not and wire it.

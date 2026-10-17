# PRISM API cheat sheet

Host `$PRISMTRACE_HOST`, header `X-PRISMtrace-Key` (never Bearer). Ingest uses
`PRISMTRACE_API_KEY`; reads/operations use `PRISM_MGMT_API_KEY`. Full route list:
`GET $PRISMTRACE_HOST/openapi.json`.

## Free reads
- `GET /api/setup-doctor?project_id=` — connection status
- `GET /api/traces?project_id=&status=failed|error|blocked|flagged|success&agent_name=&page=&page_size=`
- `GET /api/traces/{id}`, `GET /api/spans/{id}` — one trace, its span tree
- `GET /api/scores/summary?project_id=`, `GET /api/metrics/summary?project_id=&period=`
- `GET /api/intelligence?project_id=&days=&agent_name=` — read `coverage` first
- `GET /api/intelligence/clusters?project_id=&evidence_tier=corroborated` — RCA clusters
- `GET /api/intelligence/clusters/{id}?project_id=`, `GET /api/intelligence/clusters/analyze/status?project_id=`
- `GET /api/remediation?project_id=`, `POST /api/remediation/recommend?project_id=&trace_id=` (free, rules-based)
- `GET /api/alerts/fired?project_id=`
- `GET /api/credits/balance?org_id=`, `GET /api/credits/ledger?org_id=`, `GET /api/credits/catalog`

## Paid (credits) — confirm with the user first
- 5: `POST /api/intelligence/clusters/analyze` `{"project_id"}` — RCA over failures; poll status
- 1/trace: `POST /api/backfill/trace-analyses` `{"project_id","mode","max_credits"}` — quote first via `GET /api/backfill/trace-analyses/quote?project_id=`
- 1/day: `GET /api/intelligence/narrative`
- 5: `POST /api/rca/remediation/generate-fix`

## Ingest (what `daoshou/prism_tracing.py` sends per run)
- `POST /api/spans/ingest` — span tree (chain root, llm, tool spans; `status: error` on failed tools)
- `POST /api/traces` — one record per run (model, tokens, latency, agent, session)
- `POST /api/trajectories` — ordered steps for evaluation and Root Cause

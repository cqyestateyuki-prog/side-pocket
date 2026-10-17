# Side Atlas

**One ledger for global side income, with a tax layer on top.**

## The problem

Reddit’s recurring tax-season complaints start with money that does not add up:

- **Forms do not match deposits.** A 1099-K reports gross income, including platform fees. PayPal can report the same money again. Below the $20,000 / 200-transaction threshold, no 1099-K arrives, but income is still reportable.
- **Platform cuts are hard to track.** Upwork charges 0–15% per contract; Fiverr takes 20%, including tips; Freelancer.com charges 10% or $5, whichever is greater; Contra charges 0%.
- **Fees get confused with taxes.** Sellers struggle to document platform fees; some call Upwork’s service fee “tax.”
- **Quarterly taxes arrive as a surprise.** US platforms withhold nothing for US persons.
- **Withdrawals and currency conversion hide costs.** A “$0 fee” conversion can still lose roughly 6% to the spread.
- **The spreadsheet keeps growing.** Multiple income streams get stitched together by hand, month after month.

## What Side Atlas does

### One ledger for every side gig

Side Atlas brings global platform income into one ledger. Drop multiple statement exports into the import panel: it detects each platform and shows where to download its export.

Each record separates **gross → platform fee → payout/payment fees → tax withheld → net**. Withholding gets its own line, never mixed into fees.

Non-USD records convert at their own transaction date’s exchange rate, with the date and rate traceable. If a rate is missing, Side Atlas stops and names the record instead of guessing.

The fictional demo covers eight platforms. Its persona, Moon Spirit, is a New York–based designer earning from gigs and content, including Bilibili payments in CNY with Chinese individual income tax withheld.

### Tax items, sorted

The ledger supports a tax layer that organises:

- Tax already withheld, by platform and country.
- A set-aside at an editable rate **you choose**; Side Atlas does not suggest one.
- A countdown to the next US estimated-tax date.
- **Forms vs bank:** simulated 1099-style totals beside actual deposits, with gaps itemised into platform fees, payout fees, withholding and refunds.
- The 1099-K threshold and possible-duplicate flags, such as Fiverr payouts through PayPal.
- An accountant checklist and an **“Export for my accountant”** report.

Form types are simulated assumptions.

### Ask Atlas

Ask questions and watch the agent’s tool steps live. Every number in an answer links to the step that produced it, and every run is traced in PRISM.

## What we learned building it

In v1, the model read raw exports and did the math: **72/81 answers were correct**. Six failures came from silently borrowing a nearby day’s exchange rate when the required rate was missing.

In v2, code does every calculation; AI orchestrates and explains. Missing data stops the run explicitly. Results reached **81/81 on the same set**, then **89/89** across the full fictional test set, independently re-checked by a separate script.

PRISM rated v1’s missing-rate runs **CRITICAL/HIGH** and v2’s corresponding refusals **LOW**. But PRISM also called v1’s arithmetic accurate while flagging missing disclaimers. The invented rate was caught only by the reference-answer check. Both checks matter.

## What Side Atlas will not do

No tax-residency judgments, tax-owed calculations, withholding-correctness judgments, or tax or investment advice.

The demo uses fictional data, some simulated fees, and no real bank or platform connections.

Estimate only — not tax, legal, or financial advice.
---

**Live demo:** https://side-atlas.vercel.app (landing page: https://side-atlas.vercel.app/landing.html) · **Pitch script:** [`docs/pitch_script.md`](docs/pitch_script.md) · **Submission:** [`docs/submission.md`](docs/submission.md)

## How it works

Side Atlas is a tool-calling agent behind a small web app. Every model call goes through the [Nicrron API](https://nicrron.ai) (OpenAI-compatible) at temperature 0, and every run is traced into [PRISM by Block Convey](https://prism.blockconvey.com).

| | v1: the model does the math | v2: code does the math |
|---|---|---|
| Code | `daoshou/agent_v1.py` | `daoshou/agent_v2.py` + `daoshou/ledger.py` |
| Tools | `find_creator`, `read_platform_export` (raw CSV), `read_fx_rates`, `submit_answer` | `find_creator`, `load_platform`, `convert_currency`, `compute_breakdown`, `compute_set_aside`, `tax_items`, `form_check`, `compare_months`, `get_fee_details`, `submit_answer`, … |
| Math | Inside the model | `Decimal`, rounded half-up to cents only when reported |
| Missing exchange rate | Borrows a nearby day's rate and answers anyway | `convert_currency` raises `MissingFXRate`; the agent refuses and the run is marked failed in PRISM |
| Model | Claude Fable 5.1 | Claude Fable 5.1, then Claude Opus 5.5 |

`daoshou/prism_tracing.py` sends each run to PRISM three ways:
- a run-level trace (`/api/traces`);
- the span tree of every LLM and tool call (`/api/spans/ingest`), which is the Sessions → Steps tab;
- a trajectory (`/api/trajectories`).

A run is marked failed when a tool raises or when its answer does not match the reference answer. That failure signal is what PRISM's Root Cause clusters and alerts work from.

The web app (`web/`, plain HTML + ES modules, no build step) is served by FastAPI (`api/main.py`). Every money figure on screen comes from `daoshou/ledger.py` through the API. `POST /api/ask` streams the v2 agent's steps live as server-sent events.

## PRISM proofs (Money Operations track)

| Requirement | What we show | Screenshot |
|---|---|---|
| **Sessions**: one run with 6+ tool calls on the Steps tab | A v2 monthly-total run for Moon Spirit: 17 steps, each tool call with its input and output | [`01-sessions-steps-v2.jpg`](docs/prism_screens/01-sessions-steps-v2.jpg) |
| **Alert**: fires on a real run | Rules on failed runs for agent `daoshou-v2`. A missing exchange rate stops the run, which is marked failed, so a person is alerted instead of a number being guessed. Our error-rate alert on `daoshou-v2` fired on a real run: 12.5% against a 5% threshold | [`09-alert-fired.jpg`](docs/prism_screens/09-alert-fired.jpg), [`02-alert-rules.jpg`](docs/prism_screens/02-alert-rules.jpg) |
| **Root Cause**: 3+ failed runs clustered, then v2 on the same inputs | Clusters: `daoshou-v1` has 11 failed runs (cause class *prompt*, evidence *likely*); `daoshou-v2` has the deliberate `MissingFXRate` stops (cause class *tool*). On the 9 questions v1 failed, v2 scored 9/9 | [`03-root-cause-v1-cluster.jpg`](docs/prism_screens/03-root-cause-v1-cluster.jpg), [`04-root-cause-clusters.jpg`](docs/prism_screens/04-root-cause-clusters.jpg) |
| Per-trace analysis | PRISM's AI rated v1's missing-rate runs CRITICAL/HIGH ("AI agent fabricated detailed freelancer earnings data") and v2 on the same inputs LOW ("Agent correctly refused … due to missing exchange rate") | [`05-trace-analysis-v1-critical.jpg`](docs/prism_screens/05-trace-analysis-v1-critical.jpg), [`06-trace-analysis-v2-low.jpg`](docs/prism_screens/06-trace-analysis-v2-low.jpg) |

## Evaluation

The test set in [`daoshou_testdata/`](daoshou_testdata/README.md) covers:
- 12 fictional creators across 8 platforms, each with its own deliberately messy export format;
- July–September 2026;
- 89 questions with reference answers.

`daoshou_testdata/tools/check_answers.py` recomputes every answer independently.

| Run | Model | Correct | Notes |
|---|---|---|---|
| v1, traced into PRISM | Claude Fable 5.1 | 72 / 81 | 6 of the 9 failures invented an exchange rate for a date with no rate |
| v2 on exactly the questions v1 failed, traced | Claude Fable 5.1 | 9 / 9 | Missing-rate questions refused with `MissingFXRate` |
| v2, full set (dry run) | Claude Opus 5.5 | 89 / 89 | |

Per-question results are in `results/*.jsonl`.

## Run it

```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                    # add your PRISM and Nicrron keys
.venv/bin/uvicorn api.main:app --port 8811
# open http://127.0.0.1:8811/
```

- **Replay mode:** `http://127.0.0.1:8811/#ask?replay=1` replays a recorded real traced run on the Ask Atlas screen, so no model call is made. Useful offline or without keys.
- **Batch evaluation:**
  ```bash
  .venv/bin/python scripts/run_batch.py --version v2 --all --no-trace --workers 8   # not sent to PRISM
  .venv/bin/python scripts/run_batch.py --version v1 --all --workers 8              # traced into PRISM
  ```

PRISM analyses up to 200 runs a day per workspace, so use `--no-trace` while iterating.

## Repository layout

```
api/main.py              FastAPI: ledger, tax items, forms, report, streamed Ask
daoshou/                 agent code (internal codename)
  prism_tracing.py       Nicrron tool-calling loop + PRISM tracing
  agent_v1.py            v1: raw exports, the model does the math
  agent_v2.py            v2: tools do the math, the model orchestrates
  ledger.py              deterministic ledger: parsing, FX, fees, tax items, form check
  data.py, grading.py    test-data access, answer grading
web/                     the Side Atlas app (Overview, Ledger, Tax, Ask Atlas)
scripts/                 run_batch.py, smoke_test.py, astra.py (copy), gen_image.py (mascot)
daoshou_testdata/        fictional platform exports, FX rates, 89 questions + answers
design/                  design kit (tokens, spec, prototype), mascot, logo, references
docs/                    fact sheet, Reddit research, PRISM notes + screenshots, pitch, submission
results/                 batch results (JSONL)
```

## Built with

- **Nicrron API:**
  - Claude Fable 5.1 and Claude Opus 5.5 run the agent;
  - GPT-6 Astra wrote all product copy;
  - Google nano-banana-pro drew the Atlas mascot and icon.
- **PRISM by Block Convey:** tracing, alerts, root-cause clustering and per-trace analysis.
- Built at **MONEY TALKS 2** (AI × Finance hackathon, New York, October 17 2026), Money Operations track.

All data is fictional and some fees are simulated. Estimate only — not tax, legal, or financial advice.

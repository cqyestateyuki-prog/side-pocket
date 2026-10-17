# Side Atlas

**One ledger for your global side income, with the tax items you’ll probably need in view.**

## The problem

Side income crosses platforms, currencies and payout methods. Your records are scattered, and no single platform shows the whole picture.

Each platform takes its cut differently:

- **Upwork:** 0–15%, set per contract.
- **Fiverr:** 20%, including tips and extras.
- **Freelancer.com:** 10% of a fixed-price project or $5, whichever is greater.
- **Contra:** 0% for the freelancer.

Withdrawal fees and currency conversion add more deductions. Platform commissions and tax withheld on your behalf can look alike, even though they belong in different categories.

Tax preparation adds another layer: which country already withheld tax, what to set aside when nothing was withheld, when the next US estimated-tax payment is due, and what to discuss with an accountant.

## What Side Atlas does

### One ledger for every side gig

Side Atlas brings global gig and creator income into one ledger. It imports each platform’s own export format and separates every record into:

**Gross → platform fee → payout/payment fees → tax withheld → net**

Tax withheld stays on its own line, never mixed into fees. Every non-USD record is converted to USD using its transaction date’s exchange rate, with the date and rate traceable.

See income by platform and month, month-over-month changes, and which platform keeps the most of each dollar.

The fictional demo follows Moon Spirit, a New York–based designer earning through Upwork, Fiverr, Contra, YouTube, Twitch, Patreon and Bilibili. Bilibili pays her in CNY and withholds Chinese individual income tax; the other platforms pay USD.

### Tax items, sorted

The tax layer lists items you’ll probably need:

- Tax already withheld, by platform and country.
- A set-aside amount using a rate **you choose**.
- The next US estimated-tax due date.
- Items to raise with an accountant, including foreign tax withheld.

Monthly and quarterly reports give you something to hand to an accountant. Ask questions in Chinese or English about income changes, deductions or quarterly tax items. Every number in an answer comes from calculation steps, never from the model.

## What we learned building it

On our first 64-question test set, v1 let the model calculate directly from raw exports. It answered 61 exactly right. All three failures shared one cause: a missing exchange rate. The model silently borrowed a nearby day’s rate.

In v2, code does every calculation; AI orchestrates and explains. It answered 64 of 64 exactly right. Missing data now stops the run with an explicit error and triggers a PRISM alert for a person to fix it. PRISM by Block Convey traces every model and tool call and groups failures by root cause.

## What Side Atlas will not do

Side Atlas does not judge tax residency, calculate tax owed, assess whether withholding was correct, suggest a set-aside rate, or provide tax or investment advice.

This demo uses fictional data, some simulated fee assumptions, and no real bank or platform connections. Growth coaching is roadmap only.

Estimate only — not tax, legal, or financial advice.

## 中文简介

Side Atlas（副业图谱）把分散在接单、创作和内容平台上的副业收入放进同一本账，方便你看清每个平台、每个月的收入变化。  
平台抽成、提现或支付手续费、平台代扣税会分开列出，非美元收入则按每笔记录当天的汇率换算成美元，日期和汇率都有据可查。  
税务层帮你整理可能需要准备的事项：哪些国家已经代扣税、按你自己选定的比例预留多少，以及下一个美国预估税缴款截止日。  
你可以用中文或英文询问收入和扣款，也可以把月度或季度报告交给会计师；回答里的数字来自计算步骤，不由模型编造。  
目前演示使用虚构数据，不连接真实银行或平台，也不替你判断税务居民身份或计算应缴税额；所有估算都不构成税务、法律或财务建议。
---

## How it works

Side Atlas is a tool-calling agent. Every model call goes through the [Nicrron API](https://nicrron.ai) (OpenAI-compatible) to `anthropic/claude-fable-5-1` at temperature 0, and every run is traced into [PRISM by Block Convey](https://prism.blockconvey.com).

| | v1 — the model does the math | v2 — code does the math |
|---|---|---|
| Code | `daoshou/agent_v1.py` | `daoshou/agent_v2.py` + `daoshou/ledger.py` |
| Tools | `find_creator`, `read_platform_export` (raw CSV), `read_fx_rates`, `submit_answer` | `find_creator`, `load_platform`, `convert_currency`, `compute_breakdown`, `compute_set_aside`, `simulate_patreon_ios`, `compare_months`, `get_upwork_contract_fees`, `submit_answer` |
| Math | Inside the model | `Decimal`, rounded half-up to cents only when reported |
| Missing exchange rate | Borrows a nearby day's rate and answers anyway | `convert_currency` raises `MissingFXRate`; the agent refuses and PRISM alerts |

A monthly-total question for the demo persona runs 9 tool steps in v2: look up the creator, load each platform, convert currencies, break down deductions, submit.

`daoshou/prism_tracing.py` sends each run to PRISM three ways: a run-level trace (`/api/traces`), the span tree of every LLM and tool call (`/api/spans/ingest`, shown on the Sessions → Steps tab) and a trajectory (`/api/trajectories`). A run is marked failed when a tool raises or when its answer does not match the reference answer, which is what PRISM's Root Cause clusters and error-rate alerts work from.

## PRISM proofs (Money Operations track)

| Requirement | How Side Atlas shows it |
|---|---|
| **Sessions** — one run with 6+ tool calls on the Steps tab | A v2 monthly-total question walks every platform, conversion, breakdown and set-aside step |
| **Alert** — fires on a real run | The v2 currency tool fails on a date with no rate; the run is marked failed and the error-rate alert fires |
| **Root Cause** — cluster of 3+ failed runs, then v2 fixes them | v1's fabricated-rate answers cluster under one cause; v2 on the same inputs refuses instead of guessing |

## Evaluation

The first test set in [`daoshou_testdata/`](daoshou_testdata/README.md) has 9 fictional creators, 5 platforms with deliberately different export formats, July–September 2026, and 64 questions with reference answers (39 in Chinese, 25 in English). `daoshou_testdata/tools/check_answers.py` recomputes every answer independently: 64/64 match. Fiverr, Freelancer.com and Contra are being added.

| Version (dry run, Claude Fable 5.1) | Correct | Failures |
|---|---|---|
| v1 | 61 / 64 | 3: Kiki's September questions, where one record's date has no exchange rate and the model invented a rate |
| v2 | 64 / 64 | none; the 3 missing-rate questions are refused with a `MissingFXRate` error |

Per-question results: `results/v1_all_dry.jsonl`, `results/v2_all_dry.jsonl`.

## Run it

```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # add your PRISM and Nicrron keys
.venv/bin/python scripts/smoke_test.py                                  # one traced run, checks both connections
.venv/bin/python scripts/run_batch.py --version v2 --pilot --no-trace   # 6 questions, not sent to PRISM
.venv/bin/python scripts/run_batch.py --version v1 --all --workers 8    # every question, traced into PRISM
```

PRISM analyses up to 200 runs a day per workspace, so use `--no-trace` while iterating.

## Repository layout

```
daoshou/                 agent code (internal codename 到手 Daoshou)
  prism_tracing.py       Nicrron tool-calling loop + PRISM tracing
  agent_v1.py            v1: raw exports, the model does the math
  agent_v2.py            v2: tools do the math, the model orchestrates
  ledger.py              deterministic ledger: parsing, FX, fee breakdown
  data.py                reads the fictional test data
  grading.py             compares an answer with the reference answer
scripts/
  run_batch.py           runs questions, grades them, traces each run
  smoke_test.py          end-to-end connection check
  astra.py               product copy via GPT-6 Astra on Nicrron
daoshou_testdata/        fictional platform exports, FX rates, questions + answers
docs/                    product fact sheet, PRISM API notes
results/                 batch results (JSONL)
```

## Built with

- **Nicrron API**: Claude Fable 5.1 runs the agent; GPT-6 Astra wrote the product copy above.
- **PRISM by Block Convey**: tracing, root-cause clustering and alerts.
- Built at **MONEY TALKS 2** (AI × Finance hackathon, New York, October 17 2026), Money Operations track.

All data is fictional and some fee rates are simulated. Estimate only — not tax, legal, or financial advice.

# ClearTake
**See what you earned, what was deducted, and what actually landed.**

## The problem

For creators and freelancers running a US single-member LLC, earning across US and Chinese platforms means reconciling different currencies, payout schedules, and fee rules.

Gross income is not take-home income. Platform shares, payment fees, currency conversion, and tax withholding all affect what lands—but commission and tax withheld on your behalf can look like the same deduction.

US platforms do not withhold income tax for US persons. A payout arrives without that deduction, leaving creators to set money aside before quarterly estimated-tax deadlines.

Found and Keeper cover US tax; Payoneer and Wise cover payouts and FX. We found no product that reconciles Chinese and US platform income together.

## What ClearTake does

ClearTake（到手清）brings those records into one breakdown:

- **Imports five platform export formats:** Bilibili, YouTube, Twitch, Patreon, and Upwork.
- **Makes currency conversion traceable:** each CNY record uses its own date’s exchange rate.
- **Separates every deduction:** gross → platform share → payout/payment fees → tax withheld by the platform → net. Withholding stays separate from fees.
- **Shows the monthly picture:** net income, share by platform, the platform with the best net-to-gross rate, and month-over-month change.
- **Supports tax set-asides:** use a rate you choose, with a reminder before quarterly deadlines. ClearTake does not suggest a rate.
- **Answers questions in Chinese and English:** ask why take-home income changed or where the money went. Every number comes from calculation steps, not the model.
- **Produces a monthly report** to hand to your accountant.

The demo uses fictional data only, with simulated fee assumptions and no live bank or platform connections.

## What we learned building it

In v1, Claude Fable 5.1 received raw exports and did the math. It answered **61 of 64 test questions exactly right**, including per-record currency conversion.

All three failures had the same cause: one record lacked an exchange rate for its date. The model silently borrowed a nearby day’s rate and returned a confident number.

That changed v2: **code does every calculation; AI only orchestrates and explains.** Missing data stops the run with an explicit error instead of a guess.

PRISM by Block Convey traces every model and tool call, groups failed runs by root cause, and alerts on failures so a person can fix the data.

## What ClearTake will not do

ClearTake does not determine tax residency, calculate tax owed, judge whether withholding was correct, or provide tax or investment advice. Foreign tax already withheld is flagged for your accountant—not treated as final.

Estimate only — not tax, legal, or financial advice.

## 中文简介

到手清 ClearTake 面向通过美国单成员 LLC 接活、同时在中美平台赚取收入的创作者和自由职业者，帮你看清流水与实际到手之间的差额。  
它把平台分成、支付手续费和平台代扣税款分开列出，人民币收入按每笔记录当天的汇率换算，方便逐项核对。  
你可以用中文或英文问“这个月为什么到手少了”，回答中的数字都来自计算步骤；遇到缺失数据，系统会明确报错，不会让 AI 猜一个数。  
你也可以自行选择预留税款的比例、接收季度截止日前的提醒，并把月度报告交给会计，但工具不会替你计算应缴税额或判断代扣税款是否正确。  
目前演示只使用虚构数据和模拟费率，不连接真实银行或平台，结果仅供估算，不构成税务、法律或财务建议。
---

## How it works

ClearTake is a tool-calling agent. Every model call goes through the [Nicrron API](https://nicrron.ai) (OpenAI-compatible) to `anthropic/claude-fable-5-1` at temperature 0, and every run is traced into [PRISM by Block Convey](https://prism.blockconvey.com).

| | v1 — the model does the math | v2 — code does the math |
|---|---|---|
| Code | `daoshou/agent_v1.py` | `daoshou/agent_v2.py` (in progress) |
| Tools | `find_creator`, `read_platform_export` (raw CSV), `read_fx_rates`, `submit_answer` | One step per stage: look up creator, load each platform, convert each CNY record at its own date's rate, break down deductions, set-aside, submit |
| Math | Inside the model | `Decimal`, rounded half-up to cents only at the end |
| Missing exchange rate | Borrows a nearby day's rate and answers anyway | Tool raises `MissingFXRate`; the agent refuses and PRISM alerts |

`daoshou/prism_tracing.py` sends each run to PRISM three ways: a run-level trace (`/api/traces`), the span tree of every LLM and tool call (`/api/spans/ingest`, shown on the Sessions → Steps tab) and a trajectory (`/api/trajectories`). A run is marked failed when a tool raises or when its answer does not match the reference answer, which is what PRISM's Root Cause clusters and error-rate alerts work from.

## PRISM proofs (Money Operations track)

| Requirement | How ClearTake shows it |
|---|---|
| **Sessions** — one run with 6+ tool calls on the Steps tab | A v2 monthly-total question for 月之灵 walks every platform, conversion, breakdown and set-aside step |
| **Alert** — fires on a real run | The v2 currency tool fails on a date with no rate; the run is marked failed and the error-rate alert fires |
| **Root Cause** — cluster of 3+ failed runs, then v2 fixes them | v1's fabricated-rate answers cluster under one cause; v2 on the same inputs refuses instead of guessing |

## Evaluation

The test set in [`daoshou_testdata/`](daoshou_testdata/README.md) has 9 fictional creators, 5 platforms with deliberately different export formats, July–September 2026, and 64 questions with reference answers (39 in Chinese, 25 in English). `daoshou_testdata/tools/check_answers.py` recomputes every answer independently: 64/64 match.

| Version | Correct | Failures |
|---|---|---|
| v1 (dry run, Claude Fable 5.1) | 61 / 64 | 3 — all Kiki's September questions, where one record's date has no exchange rate and the model invented a rate |
| v2 | pending | |

Per-question results: `results/v1_all_dry.jsonl`.

## Run it

```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # add your PRISM and Nicrron keys
.venv/bin/python scripts/smoke_test.py                                  # one traced run, checks both connections
.venv/bin/python scripts/run_batch.py --version v1 --pilot --no-trace   # 6 questions, not sent to PRISM
.venv/bin/python scripts/run_batch.py --version v1 --all --workers 8    # all 64, traced into PRISM
```

PRISM analyses up to 200 runs a day per workspace, so use `--no-trace` while iterating.

## Repository layout

```
daoshou/                 agent code (internal codename 到手 Daoshou)
  prism_tracing.py       Nicrron tool-calling loop + PRISM tracing
  agent_v1.py            v1: raw exports, the model does the math
  data.py                reads the fictional test data
  grading.py             compares an answer with the reference answer
scripts/
  run_batch.py           runs questions, grades them, traces each run
  smoke_test.py          end-to-end connection check
  astra.py               product copy via GPT-6 Astra on Nicrron
daoshou_testdata/        fictional platform exports, FX rates, 64 questions + answers
docs/                    product fact sheet, PRISM API notes
results/                 batch results (JSONL)
```

## Built with

- **Nicrron API** — Claude Fable 5.1 runs the agent; GPT-6 Astra wrote the product copy above.
- **PRISM by Block Convey** — tracing, root-cause clustering and alerts.
- Built at **MONEY TALKS 2** (AI × Finance hackathon, New York, October 17 2026), Money Operations track.

All data is fictional and fee rates are simulated. Estimate only — not tax, legal, or financial advice.

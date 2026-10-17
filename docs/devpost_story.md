## Inspiration

Side income arrives through platforms that account for money differently. A 1099-K can show gross earnings before fees, while PayPal may report the same money again. Overseas payouts add currency conversion and withholding.

We built Side Atlas at MONEY TALKS 2 in New York, in the Money Operations track, to put global side income in one ledger, with a tax layer for organising likely tax items.

## What it does

We accept platform exports in batches and detect their formats. The ledger separates gross earnings from platform fees, payout fees, tax withheld and net income. Each non-USD record uses its own date’s exchange rate. Missing rates stop processing and identify the record.

The tax screen shows withholding by platform and country, a set-aside at a user-chosen rate, and the next US estimated-tax deadline. “Forms vs bank” compares simulated form amounts with payouts, itemises differences and flags possible duplicates. We include an accountant checklist and export.

Ask Atlas shows tool steps live. Every answer number links to the step that produced it.

The demo uses fictional data, simulated form assumptions and some simulated fees, with no live connections. We do not calculate tax owed or make residency judgments. Estimate only. Not tax, legal, or financial advice.

## How we built it

**Agent:** v1 had four tools and let the model read raw CSVs and do arithmetic. In v2, model calls through Nicrron handle orchestration and explanation. Plain Python with Decimal performs every calculation, keeping it cheap, predictable and explainable. The pipeline uses `find_creator`, `load_platform` per platform, `convert_currency` and `compute_breakdown`, with question-specific tools including `compute_set_aside`, `tax_items`, `form_check`, `compare_months` and `get_fee_details`, before `submit_answer`.

**Data:** Using Claude Code, we generated 12 fictional creators across eight platforms with deliberately different export formats, covering July to September 2026. We built 89 questions with reference answers and an independent checker script.

**Observability:** We traced every run in PRISM by Block Convey, capturing spans and trajectories across about 115 runs. We analysed 19 failing runs and ran Root Cause. Sessions shows a v2 run with 17 steps. An error-rate alert fired on a real v2 run at 12.5%, against a 5% threshold.

**Front end:** We built plain HTML/CSS/JS served by FastAPI on Vercel, plus a landing page. Screens include Overview, Ledger with an import panel, Tax with forms versus bank, and Ask Atlas with a live step timeline. Google nano-banana-pro drew Atlas, our pigeon mascot; GPT-6 Astra wrote the product copy.

## Challenges we ran into

v1 filled a missing exchange rate with a nearby day’s rate instead of stopping, since nothing in its tools could say “this rate does not exist.” Six of its nine incorrect answers had this failure.

PRISM’s per-trace analysis initially failed on its side. Our refusal text also prevented the error-rate alert from counting failed runs. We fixed reporting by giving no-answer runs an empty output.

## Accomplishments that we're proud of

v1 answered 72 of 81 questions correctly. v2 reached 81/81 on that set and 89/89 on the full set.

PRISM Root Cause clustered 11 failed v1 runs, with the judge agreeing. On the nine questions v1 failed, v2 scored 9/9 and was rated LOW/compliant; v1 was CRITICAL/HIGH.

## What we learned

PRISM initially called v1’s arithmetic accurate while flagging missing disclaimers. Our reference-answer checker caught the invented rate. We need both checks.

Missing data needs an explicit tool error. A confident explanation cannot repair an unsupported calculation.

## What's next for Side Atlas

- Add official API connections for YouTube, Twitch, Patreon, Upwork and PayPal.
- Accept forwarded emails from platforms without APIs.
- Add bank matching.
- Import real 1099 forms and match them against ledger records.
- Cover more countries’ withholding rules.
- Add a Chinese language switch to the English-only UI.
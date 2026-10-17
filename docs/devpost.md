PROJECT NAME

Side Atlas

ELEVATOR PITCH

We bring global side income into one ledger, separate fees from tax withheld, and help prepare for US tax time with a set-aside you control.

INSPIRATION

We kept seeing the same tax-season complaint on Reddit. A platform’s form reports gross income, while the bank shows what survived the fees. PayPal can report the same money again.

We built Side Atlas at MONEY TALKS 2 in the Money Operations track. We wanted one ledger for side income across currencies, with a tax layer that helps explain the gaps.

WHAT IT DOES

- Imports platform exports in batches and detects their formats. The demo covers eight platforms.
- Separates gross income from fees and tax withheld, then shows net income. Non-USD records use their own date’s exchange rate. A missing rate stops the calculation.
- Tracks withholding by platform and country. Users choose their own set-aside rate and see the next US estimated-tax deadline.
- Compares simulated 1099-style figures with payouts, itemises differences and flags possible duplicates. Includes an accountant checklist and export.
- Lets users ask Atlas questions and watch tool steps live. Every answer’s numbers link to the steps that produced them.

The demo uses fictional data, with some simulated fees and form assumptions. There are no live bank or platform connections. We do not calculate tax owed or make tax-residency judgments.

Estimate only. No tax, legal, or financial advice.

HOW WE BUILT IT

We moved every calculation into code. The AI orchestrates the tools and explains their output.

Through Nicrron, we ran initial versions on Claude Fable 5.1 and the full v2 dry run on Claude Opus 5.5. GPT-6 Astra wrote product and pitch copy. Google nano-banana-pro generated Atlas and the app icon.

PRISM traces every model and tool call. One v2 run shows 17 steps. We configured alerts for error rate and failed traces.

Live demo https://side-atlas.vercel.app

Landing page https://side-atlas.vercel.app/landing.html

Code https://github.com/cqyestateyuki-prog/hackson_global_income

CHALLENGES WE RAN INTO

Our first version let the model calculate from raw exports. It got 72 of 81 questions right. Six failures came from invented exchange rates when a record’s date had no rate.

The answers sounded confident. That was the problem.

ACCOMPLISHMENTS THAT WE ARE PROUD OF

V2 got 9 of 9 on exactly the questions v1 failed, then 89 of 89 on the full fictional test set, independently re-checked by a separate script.

PRISM rated the missing-rate v1 runs CRITICAL/HIGH for fabricated earnings data. On the same inputs, v2 appropriately refused and received LOW ratings. Root Cause grouped 11 failed v1 runs, and the judge agreed.

WHAT WE LEARNED

PRISM’s analysis called v1’s arithmetic accurate while flagging missing disclaimers. Our reference-answer check caught the invented rate.

We needed both checks. An explicit missing-data error is a result we can stand behind.

WHAT IS NEXT

We plan official API connections where available and email forwarding for the rest. Bank matching is also planned. Growth coaching remains on the roadmap.

BUILT WITH

PRISM by Block Convey, Nicrron API, Claude Fable 5.1, Claude Opus 5.5, GPT-6 Astra, Google nano-banana-pro
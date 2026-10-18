# Product fact sheet (input for copywriting — facts only, no marketing language)

Product name: **Side Pocket** (renamed on 2026-10-17; the hackathon submission was called Side Pocket). Internal codename only: Daoshou. English-only UI.

## Product in one line
One ledger for all of a person's side income from global platforms, in every currency, with a tax layer on top that sorts out the tax items they will probably need. Core = the ledger. Demo centrepiece = the tax layer. Growth coaching is roadmap only.

## Look and feel
- Soft violet (#6B5BC2) with pink accents, calm white tables, every money figure dark and tabular; WCAG AA contrast checked.
- Mascot: **Tilly**, a chubby lilac-and-pink carrier pigeon with crescent "^ ^" smiling eyes, a coin satchel and a map scarf, drawn as a flat sticker illustration (generated with Google nano-banana-pro via Nicrron). Tilly waves on the overview, works at a laptop while the agent runs, flies in with an envelope when the answer arrives, drops a coin in a piggy bank on the Tax page, and celebrates milestones.
- Four screens: Overview, Ledger, Tax, Ask Tilly; plus My data and Settings & privacy.

## Who it is for
- People anywhere who earn side income through global platforms:
  - gig platforms: Upwork, Fiverr, Freelancer.com, Contra
  - creator platforms: YouTube, Twitch, Patreon
  - Chinese platforms such as Bilibili
- 8 platforms in the demo.
- The demo user's tax home is the US. She runs her side work as a sole proprietor / single-member LLC; by default the IRS treats a single-member LLC's income as the owner's.
- Demo persona (fictional): Moon Spirit, a New York–based designer. On the side she takes design gigs on Upwork, Fiverr and Contra and makes content on YouTube, Twitch, Patreon and Bilibili. Bilibili pays her in CNY and withholds Chinese individual income tax; the rest pay USD.

## The problem (real pain points from Reddit, see docs/reddit_pain_points.md)
- Tax forms don't match what actually landed. A 1099-K reports gross including platform fees; PayPal can report the same money again; below the $20,000 / 200-transaction threshold no 1099-K arrives at all, yet the income is still reportable. This is the most frequent complaint every filing season.
- Platform fees are opaque and undocumented. One Fiverr seller paid $12K+ in fees over two years with no documentation for tax time. Many people call Upwork's service fee "tax".
- Nobody sets tax aside: US platforms withhold nothing for US persons, and quarterly estimated taxes come as a surprise.
- Hidden cost of withdrawal fees and FX spread ("$0 fee", yet ~6% gone on a conversion).
- Multiple income streams stitched together by hand in spreadsheets (12 monthly sheets a year).
- Every platform takes its cut differently:
  - Upwork 0–15% per contract
  - Fiverr a flat 20% including tips
  - Freelancer.com 10% or $5, whichever is greater
  - Contra 0%
- Existing tools cover one slice: Found and Keeper handle US tax; Payoneer and Wise handle payouts and FX. We found no product that puts global side income from gig, creator and Chinese platforms into one ledger.

## What it does
### Ledger
- Imports each platform's own export format: drop many files at once, the platform is detected automatically, and each platform shows where to download its export.
- Converts every non-USD record at that record's own date's rate, traceable to a date and rate.
- Breaks each dollar down: gross → platform fee → payout/payment fees → tax withheld (its own line, never mixed into fees) → net.
- If a rate is missing, Side Pocket stops and names the record instead of guessing.
- Planned: automatic connections via official APIs (YouTube, Twitch, Patreon, Upwork, PayPal), email forwarding for the rest, bank matching.

### Tax layer
- Tax already withheld, by platform and country.
- Set-aside at a rate the person chooses (editable; Side Pocket does not suggest a rate).
- Countdown to the next US estimated-tax date.
- **Forms vs bank:** what a 1099-style form would show per platform next to what actually landed, with the gap itemised (platform fees, payout fees, tax withheld, refunds), the real 1099-K threshold, and a possible-duplicate flag (e.g. Fiverr paid out to PayPal). Form types are simulated assumptions.
- An accountant checklist and an "Export for my accountant" report.

### Ask Tilly
Q&A where you watch the agent's tool steps live; every number in the answer links to the step that produced it, and every run is traced in PRISM.

## What it deliberately does not do
- No tax-residency judgments, no tax-owed calculation, no judging whether withholding was correct, no tax or investment advice.
- No real bank or platform connections; fictional data only (event rule). Some fees are simulated.
- Disclaimer: "Estimate only — not tax, legal, or financial advice."

## What we learned building it (measured today)
- Test set: 12 fictional creators, 8 platforms, Jul–Sep 2026, 89 questions with reference answers, independently re-checked by a separate script.
- v1 gave the model (Claude Fable 5.1) the raw exports and let it do the math. Traced into PRISM, it answered **72 of 81** right.
  - 6 of the 9 failures were the same: a record had no exchange rate for its date, and the model silently borrowed a nearby day's rate and reported a confident number.
  - The other 3 were small slips.
- v2: code does every calculation, and the AI only orchestrates and explains.
  - 81/81 on the same set, then **89/89** on the full set (dry run on Claude Opus 5.5).
  - On exactly the 9 questions v1 failed, v2 got **9/9**.
  - Missing data stops the run with an explicit error instead of a guess.
- PRISM's own per-trace analysis agrees:
  - v1's missing-rate runs were rated CRITICAL/HIGH, e.g. "AI agent fabricated detailed freelancer earnings data".
  - v2 on the same inputs was rated LOW: "Agent correctly refused … due to missing exchange rate".
- PRISM Root Cause clustered the failures:
  - daoshou-v1: a cluster of 11 failed runs, cause class "prompt", evidence "likely".
  - daoshou-v2: a cluster of 15 runs, cause class "tool". These are the deliberate MissingFXRate stops.
- Telling detail: PRISM's AI called v1's arithmetic accurate while flagging missing disclaimers. The invented exchange rate was only caught by our reference-answer check. Both layers are needed.

## How we used the sponsors
- **PRISM by Block Convey:**
  - every run traced (each model call and tool call is a step; one v2 run shows 17 steps);
  - alert rules on failed runs;
  - Root Cause clusters;
  - per-trace AI analysis.
- **Nicrron API:**
  - the agent runs on Claude Fable 5.1 (first v1/v2 runs) and Claude Opus 5.5 (cheaper, same 89/89);
  - all product and pitch copy is by GPT-6 Astra;
  - the Tilly mascot and app icon are by Google nano-banana-pro.
- Built at MONEY TALKS 2 (AI × Finance hackathon, New York, Oct 17 2026), Money Operations track.

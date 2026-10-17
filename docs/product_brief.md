# Product fact sheet (input for copywriting — facts only, no marketing language)

Working name: 到手 Daoshou ("what actually lands in your hand"). An international name is being chosen.

## Who it is for
- Creators and freelancers who run a US single-member LLC and earn on both US and Chinese platforms.
- By default the IRS treats a single-member LLC's income as the owner's own, so the numbers work the same as for an individual.
- Demo persona (fictional): 月之灵 (Moon Spirit), a New York–based VTuber and US tax resident who also takes design gigs on Upwork. Income: Bilibili (CNY, settled to her as an individual; the platform withholds Chinese individual income tax), plus YouTube, Twitch, Patreon and Upwork (USD).

## The problem
- Income is spread across platforms with different currencies, payout schedules and fee rules.
- Platforms show gross; before money lands it loses a platform share, payout/payment fees, FX conversion, and sometimes tax the platform withheld.
- Creators can't tell a platform's commission from tax withheld on their behalf; the two get lumped together.
- US platforms do not withhold income tax for US persons, so money lands in full and nobody sets tax aside; creators discover the gap at quarterly estimated-tax time.
- Existing tools cover one slice: Found and Keeper handle US tax only; Payoneer and Wise handle payouts and FX only. We found no product that reconciles Chinese and US platform income together.

## What it does
- Imports each platform's own export format (5 platforms, deliberately messy formats).
- Converts every CNY record at that record's own date's rate, so each conversion is traceable to a date and rate.
- Breaks each dollar down: gross → platform share → payout/payment fees → tax withheld by the platform (its own line, never mixed into fees) → net.
- Dashboard: monthly net, share by platform, platform with the best net-to-gross rate, month-over-month change.
- Tax set-aside at a rate the creator chooses (the tool does not suggest a rate), with a reminder before quarterly deadlines.
- Q&A in Chinese and English ("why did I take home less this month?", "who took my money?"); every number in an answer comes from the calculation steps, never from the model.
- Monthly report the creator can hand to an accountant.

## What it deliberately does not do
- No tax-residency judgments, no tax-owed calculation, no judging whether withholding was correct, no tax or investment advice.
- Foreign tax already withheld (e.g. Bilibili) is flagged for the accountant, not treated as final.
- No real bank or platform connections; fictional data only (event rule). Fee rates are simulated assumptions.
- Disclaimer: "Estimate only — not tax, legal, or financial advice."

## What we learned building it (true, measured today)
- v1 gave Claude Fable 5.1 the raw exports and let it do the math. It answered 61 of 64 test questions exactly right, including per-record currency conversion.
- All 3 failures were the same: one record had no exchange rate for its date, and the model silently borrowed a nearby day's rate and reported a confident number instead of saying it couldn't.
- Design consequence (v2): code does every calculation; the AI only orchestrates and explains. Missing data stops the run with an explicit error instead of a guess, and that error fires a PRISM alert so a person can fix the data.
- Every run is traced in PRISM by Block Convey (each model call and tool call as a step); PRISM groups failed runs by root cause and alerts on failures.

## Context
- Built at MONEY TALKS 2 (AI × Finance hackathon, New York, Oct 17 2026), Money Operations track.
- Model calls go through the Nicrron API; agent model: Claude Fable 5.1. Observability: PRISM by Block Convey.

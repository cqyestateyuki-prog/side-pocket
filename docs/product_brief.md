# Product fact sheet (input for copywriting — facts only, no marketing language)

Internal codename: 到手 Daoshou. Needs an international product name.

## Product in one line (direction chosen 2026-10-17)
One ledger for all of a person's side income from global platforms, in every currency, with a tax layer on top that sorts out the tax items they will probably need. Core = the ledger (A). Demo centrepiece = the tax layer (B). Growth coaching (goals, which side gig is worth continuing) is roadmap only.

## Who it is for
- People anywhere who earn side income through global platforms:
  - gig platforms: Upwork, Fiverr, Freelancer.com, Contra
  - creator platforms: YouTube, Twitch, Patreon
  - Chinese platforms such as Bilibili
- The demo user's tax home is the US. She runs her side work as a sole proprietor / single-member LLC (by default the IRS treats a single-member LLC's income as the owner's, so the numbers are the same).
- Demo persona (fictional): 月之灵 (Moon Spirit), a New York–based designer. On the side she takes design gigs on Upwork, Fiverr and Contra and makes content on YouTube, Twitch, Patreon and Bilibili. Bilibili pays her in CNY as an individual and withholds Chinese individual income tax; the rest pay USD.

## The problem
- Side income is spread across many platforms, currencies and payout methods; no single place shows the whole picture.
- Every platform takes its cut differently:
  - Upwork: 0–15%, set per contract
  - Fiverr: a flat 20%, including tips and extras
  - Freelancer.com: 10% of a fixed-price project or $5, whichever is greater
  - Contra: 0% for the freelancer
  - On top of that: withdrawal/payout fees and currency conversion.
- Platforms show gross; what lands is smaller, and a platform's commission and tax it withheld on your behalf look like the same deduction.
- Tax items end up scattered: some income already had tax withheld (and by which country), US platforms withhold nothing for US persons so nobody sets tax aside, quarterly estimated-tax deadlines come up, and foreign tax already withheld is something to raise with an accountant.
- Existing tools cover one slice: Found and Keeper handle US tax only; Payoneer and Wise handle payouts and FX only. We found no product that puts global side income from gig, creator and Chinese platforms into one ledger.

## What it does
### Ledger (A)
- Imports each platform's own export format, each deliberately different.
- Converts every non-USD record at that record's own date's rate, so each conversion is traceable to a date and rate.
- Breaks each dollar down: gross → platform fee → payout/payment fees → tax withheld by the platform (its own line, never mixed into fees) → net.
- Shows income by platform and month, month-over-month change, and which platform keeps the most of each dollar.

### Tax layer (B)
- Lists the tax items the person will probably need:
  - tax already withheld, by platform and country
  - a set-aside amount at a rate the person chooses (the tool does not suggest a rate)
  - the next US estimated-tax due date
  - items to raise with an accountant, such as foreign tax withheld
- A monthly/quarterly report to hand to an accountant.
- Q&A in Chinese and English ("why did I make less this month?", "who took my money?", "what tax items do I have this quarter?"). Every number in an answer comes from the calculation steps, never from the model.

## What it deliberately does not do
- No tax-residency judgments, no tax-owed calculation, no judging whether withholding was correct, no tax or investment advice.
- No real bank or platform connections; fictional data only (event rule). Some fees are simulated assumptions.
- Disclaimer: "Estimate only — not tax, legal, or financial advice."

## What we learned building it (true, measured today on the first 64-question test set)
- v1 gave Claude Fable 5.1 the raw exports and let it do the math. It answered 61 of 64 questions exactly right, including per-record currency conversion.
- All 3 failures were the same: one record had no exchange rate for its date, and the model silently borrowed a nearby day's rate and reported a confident number instead of saying it couldn't.
- v2: code does every calculation; the AI only orchestrates and explains. It answered 64 of 64. Missing data stops the run with an explicit error instead of a guess, and that error fires a PRISM alert so a person can fix the data.
- Every run is traced in PRISM by Block Convey (each model call and tool call as a step); PRISM groups failed runs by root cause and alerts on failures.

## Context
- Built at MONEY TALKS 2 (AI × Finance hackathon, New York, Oct 17 2026), Money Operations track.
- Model calls go through the Nicrron API; agent model: Claude Fable 5.1; product copy: GPT-6 Astra. Observability: PRISM by Block Convey.

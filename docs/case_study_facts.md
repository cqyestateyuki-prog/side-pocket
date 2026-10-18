# Side Pocket case study: facts (no prose)

Every fact below is checked against the repo. Sources in brackets. "I" in the case study = the founder (product owner and designer); the build team was AI coding agents (Claude Code), GPT-6 Astra for copy, Google nano-banana-pro for art.

## Names and timeline
- Product name now **Side Pocket**; mascot and assistant **Tilly** ("Ask Tilly"). Renamed 2026-10-17 21:33 because the founder felt "Side Atlas" sounded robotic. GPT-6 Astra proposed 12 names (Roost, Side Pocket, Patchwork, Breadbox, Pigeon Post, Side Table, Common Thread, Daybook, Take Home, Gather Round, Loose Ends, Second Helping); the founder picked Side Pocket. Astra proposed 8 pigeon names; the founder picked Tilly. [commit cf642b0, docs/product_brief.md]
- Submitted to MONEY TALKS 2 (AI x Finance hackathon, New York, Money Operations track) on 2026-10-17 as **Side Atlas**; internal codename 到手 Daoshou ("take home"). [到手 Daoshou 需求文档 v2.md, docs/devpost_story.md]
- First commit 2026-10-17 11:43 (PRISM tracing set up). Devpost submission before the 4:15 PM deadline. Post-hackathon work the same evening, last commit in scope 21:35. 67 commits that day. [git log]
- Hackathon requirements: build on PRISM by Block Convey with three proofs (a Sessions run with 6+ steps; an alert firing on a real run; a Root Cause cluster of 3+ failed runs, then v2 on the same inputs no longer failing); model calls through the Nicrron API. [README.md proofs table]

## Problem (original idea, then the pivot)
- Original requirements doc (到手 Daoshou v2): an "AI income manager" for creators and freelancers who earn on both Chinese and US platforms, answering "how much actually landed, who took how much, how much to set aside". Problems listed: income spread across platforms with different currencies, payout cycles and commission rules; platforms show gross, then commission, withdrawal fees, FX spread and sometimes pre-withheld tax are taken; creators cannot tell commission from withholding; rules change (Douyin starts withholding the day after income reaches the withdrawable account from 2026-10-01); existing creator finance tools mostly cover US platforms only. Scope: no tax-status judgment, no tax owed, no investment advice, no live bank or platform connections, simulated data only. [到手 Daoshou 需求文档 v2.md]
- Pivot (commit afe4a85, 12:26): the founder said the work had drifted; the goal is people anywhere who earn side income on global platforms. Reframed as a global side-income ledger with a tax layer; added Fiverr, Freelancer.com and Contra (commit ee0fbee). [git log]
- Later direction (evening): first a statistics view of all side income (which gigs, how much each made), with bookkeeping and rewards; the Tax page stays. [project memory; design decision #47 to #55]

## Research
- Reddit public threads read on 2026-10-17, 7 ranked pain points: (1) tax forms don't match what landed: 1099-K shows gross including platform commission, PayPal may report the same money again, below the $20,000 / 200 transaction threshold people get no form; (2) platform fees are opaque and change (a Fiverr seller: $54K earned in 2 years, $12K+ in fees with no documentation; Upwork users calling fees "tax"); (3) no tax set aside, quarterly estimates missed (YouTube thread ~93 comments; commenters set aside 30 to 35%); (4) withdrawal fees and FX spread as a hidden fee (Payoneer: ~6% lost on $1,500; 4.22% below mid-market); (5) several income streams stitched together in spreadsheets (12 monthly sheets a year); (6) cross-border reporting: DAC7, 1042-S, which FX rate to use; (7) tool gaps (Wave lacks multi-currency, Xero too heavy). [docs/reddit_pain_points.md]
- Takeaway: the sharpest pain is proving the numbers (forms vs what landed, undocumented fees, double reporting) more than computing tax; many users can't tell platform fees from tax, so separating them is itself valuable. [docs/reddit_pain_points.md]

## Who it is for
- People anywhere who earn side income through global platforms: gig (Upwork, Fiverr, Freelancer.com, Contra), creator (YouTube, Twitch, Patreon), Chinese platforms such as Bilibili. 8 platforms in the demo. [docs/product_brief.md]
- Sample account (fictional): Moon Spirit, a New York designer with a US tax home who runs side work as a single-member LLC; gigs on Upwork, Fiverr, Contra; content on YouTube, Twitch, Patreon, Bilibili; Bilibili pays in CNY and withholds Chinese individual income tax. [docs/product_brief.md]
- Test data: 12 fictional creators, 8 platforms with deliberately different export formats, July to September 2026, 89 questions with reference answers and an independent checker script. [README.md]

## Principles (creative process)
- Every number needs a source: each answer number links to the step that produced it; every converted record shows its rate, rate date and source. [README.md, commit 7efa04b]
- Code does the math, the model orchestrates and explains (v2). [README.md]
- Stop instead of guess: a missing rate stops the run and names the record. [README.md]
- Privacy by default (post-hackathon): data stays in the browser, the server computes and keeps nothing. [docs/personal_api.md]
- Kit-first: a full design kit (spec, tokens, HTML prototype, screenshots, decision log) is signed off before any UI code; every visual ruling lives in the decision log (73 decisions by v1.4.1). [design/Side-Atlas-Design-Kit v1/Side-Atlas-Design-Decisions.md]
- Copy rule: all product copy by GPT-6 Astra; Claude writes code. [docs/copy_style.md]

## Iteration 1: the AI that guessed (v1 to v2)
- v1 (Claude Fable 5.1 via Nicrron, temperature 0): the model reads raw CSV exports and does the arithmetic, 4 tools. Result 72 of 81 correct. Of the 9 failures, 6 were fabricated answers on questions where an exchange rate was missing (Q062, Q063, Q064, Q079, Q080, Q081): the model borrowed a nearby day's rate instead of stopping; 3 were small arithmetic errors ($0.02, $0.49, $1.65). [results/v1_all.jsonl]
- Example: "How much did Lena Koch earn on Freelancer.com in August?" v1 used the August 20 rate for an August 21 record and answered $3,051.80; v2 stopped at the missing EUR rate for 2026-08-21 and asked for it. [deck compare slide, docs/speech_script.md]
- PRISM: every run traced (about 115 runs); Root Cause clustered 11 failed v1 runs (cause class prompt, evidence likely); per-trace analysis rated v1 CRITICAL and v2 compliant (LOW). PRISM's analysis called v1's arithmetic accurate; only the reference-answer checker caught the invented rate. [docs/devpost_story.md, README.md, docs/prism_screens/03, 05, 06, 07, 08]
- v2: deterministic Decimal ledger tools; the model only orchestrates and explains; a missing rate raises MissingFXRate and the run refuses. 9 of 9 on the questions v1 failed; 81/81 on the same set; 89/89 on the full set (Opus 5.5 dry run), re-checked by a separate script. [results/v2_v1fails.jsonl, results/v2_opus_dry.jsonl]
- Alert: the error-rate alert at first didn't count refusals as failures; fixed by sending no-answer runs with empty output; the alert then fired on a real run at 12.5% against a 5% threshold. Sessions shows a v2 run with 17 steps. [commit 26d99b0, docs/prism_screens/09, 01]
- Lesson: missing data needs an explicit tool error; a confident explanation can't repair an unsupported number; an AI judge and reference answers are both needed. [docs/devpost_story.md]

## Iteration 2: look and feel (kit v1 to v1.2)
- v1 kit (14:08): Linktree as the reference for form, not colour; primary forest green #1F4B2C, lime accent; Plus Jakarta Sans. [decisions #1 to #8, commit de9f69f]
- Earlier the founder had first picked a Mercury-like desktop look, then asked for a more personal creator style like YouTube or Instagram. [session notes]
- Palette lab note on forest: steady and trustworthy like a ledger, but mismatched with the pink and lilac mascot; on violet: creative without losing professionalism, best match with the pigeon. [design/palette-lab/board.html]
- Palette lab: the same prototype with only colour variables swapped: forest, Instagram gradient, violet, pink, forest + pink, then three "less purple" violets. Chosen: soft violet #6B5BC2 + pink #FF7AB6 with WCAG AA fixes (on-primary text 4.71:1, meta #696B83 5.21:1, pink text on white #C42F78 5.22:1). [design/palette-lab/board.html, purple.html, decisions #19, #20]
- Mascot: Pop Mart blind-box style concepts first (3D); an owl was ruled out as too close to Duolingo; round shiny eyes were too Duolingo-like, so crescent ^ ^ eyes; 3D became a flat sticker illustration; the first size was too big, so mascot sizes became tokens (128 / 84 / 56 / 40 px). [design/mascots/m1*.png, board.html, decision #21]
- Navigation: too many items, cut to exactly four screens (Overview, Ledger, Tax, Ask); duplicates merged, nothing unique removed; bilingual labels dropped, the UI became English only. [decisions #23 to #29]

## Iteration 3: bring your own data, privately (v1.3, v1.3.1)
- After the pitch, someone asked which stack we used and how a user can know the AI's numbers are right; the founder asked to let people use their own China/US income and protect privacy. Decisions: upload statements only; data in the browser; server computes and keeps nothing; US and China tax homes; USD/CNY. [decisions #30 to #33]
- Account IDs are replaced in the browser with 4-digit labels (salted hash) before upload (2 digits collided); the server pseudonymises again before the model; the model gets totals only; PRISM traces for personal runs are content-free (step and tool names, timings, token counts, status). Requests over 4 MB are refused; responses are no-store. [decisions #38, #39, #46; docs/personal_api.md; commits f754a5f, 7efa04b]
- China tax home: annual filing window March 1 to June 30 of the next year, IIT already withheld by Bilibili, a flag for income from platforms outside China; never tax owed. [commit f754a5f, decision #40]
- FX rule debate: the design drew weekends filled from ECB while a rate file was uploaded; the backend rule won: a user's rate file is used exactly and a missing date stops; ECB reference rates only for currencies without a file, weekends and holidays use the last publication up to 7 days back, labelled ("ECB rate of Fri Aug 21"); sources are never mixed within a currency. [decision #45, commit 8158d23]
- Regression: demo endpoints' 733 outputs unchanged; tests 75 → 83 → 122 passing; 89/89 still. [commit messages f754a5f, 7efa04b, 3ed778a]

## Iteration 4: less text, clearer controls (v1.4.1)
- My data page "too much text": removed the eyebrow, the 8-platform sentence, the drop hint, two extra buttons; privacy promises shortened to three phrases with a link; download paths folded away. [decision #56 to #58, commit 731eb19]
- Badge tiles: removed the reason-in-numbers line, kept the earned date. [decision #59]
- Period and currency switches became dropdowns; one dropdown component and one menu style everywhere (period, currency, creator, column filters). [decisions #63, #65, commits dcfbe78, b023c5e]
- Ledger: the chip filter row removed; filters moved into the column headers (Date sorts, Platform and Type filter); outline icons on every column header. [decisions #64, #67]
- Platform colour dots replaced by real platform marks (Simple Icons 15.22.0, CC0, brand colours; letter marks for Contra and Fiverr); flags for withheld tax by country; subtitles that repeated the period and currency removed. [decisions #61, #62, #70]
- One sidebar menu: My data and Settings under the main screens; tagline, PRISM chip and disclaimer left the sidebar; the disclaimer now closes the Tax page. [decision #66]

## Iteration 5: Tilly everywhere
- 16 new flat poses for income and rewards from 29 candidates (coin, coin stack, trophy, medal, piggy bank, ledger, receipt, laptop, creator, calculator, globe, envelope, flag, thumbs up, sleeping, star badge), about $8.5 of image credits. [commit 5aa477d]
- Placement: piggy bank on the Tax hero (same size and spot as Overview), laptop while the agent works, ledger in the empty steps card, envelope when the answer arrives, coin on the Ledger net card, receipt on My data, globe in Settings, badge poses on Milestones. [decisions #69, #71, #72; commits 32b47ab, cf642b0]

## Iteration 6: copy that doesn't sound like AI
- The founder rejected lines as AI-written: "Your tax items, together.", "Your forms and bank deposits, side by side", "to set aside: $5,428.94 net × the 25% you chose". All 137 UI strings went back to GPT-6 Astra with a plain microcopy guide (docs/copy_style.md). Examples after: "Tax summary"; "Forms vs deposits"; "25% of Q3 net income ($15,910.15)"; "September net income"; welcome headline "Side Pocket tracks your global side income." [commit cf642b0, docs/copy_style.md]
- One meaning error caught in review: Astra turned "keeps the most" (highest share of gross kept) into "Highest fee share"; reverted. [commit cf642b0 review]

## Iteration 7: from tax tool to all side income (v1.4, designed, being built)
- Manual income and expenses (notes stay in the browser), kept after expenses, monthly goal with progress, 8 milestone badges computed by code (first $1,000 month, best month so far, 3 months of growth, new source, 5 sources, new currency, $10,000 total, a complete month). Sample numbers for Moon Spirit: September kept after expenses $5,913.34; goal $6,000 reached Sep 28; 7 of 8 badges. [commit 38851fe, eb793a6, decisions #47 to #55]

## Results (as of 2026-10-17 evening)
- Hackathon: all three PRISM proofs done; Devpost submitted. [README.md]
- v1 72/81 → v2 9/9 on v1's failures, 89/89 overall; alert fired on a real run.
- Live app and landing page on Vercel; 122 tests passing; design kit v1.4.1 with 73 logged decisions and a 47-page spec.
- What's next (from the submission plus later decisions): official API connections for YouTube, Twitch, Patreon, Upwork and PayPal; forwarded emails for platforms without APIs; bank matching; real 1099 import; more countries' withholding rules; check the 8 statement formats against real exports; a Chinese language switch. [docs/devpost_story.md, commit f754a5f note]

## Images (docs/case_study_assets/)
- 01-v1-forest.png: kit v1, forest green with Linktree form [design/palette-lab/a_forest_overview.png]
- 02-palette-lab.png: five palettes on the same Overview [design/palette-lab/*_overview.png]
- 03-mascot-iterations.png: 3D round eyes → 3D crescent eyes → flat sticker [design/mascots/m1_pigeon.png, m1c_pigeon_crescent.png, web/assets/mascot/wave.png]
- 04-tilly-poses.png: the 16 v2 poses [design/mascots/atlas_v2/sheet.png]
- 05..10: PRISM proofs [docs/prism_screens]
- 11/12: My data before/after; 13/14: Ledger before/after; 15/16: Tax hero before/after; 17: CNY ledger with ECB labels; 18: rate file stop; 19: Settings & privacy; 20: current Overview.

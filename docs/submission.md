# Side Atlas

- Landing page: https://side-atlas.vercel.app/landing.html
- Live demo: https://side-atlas.vercel.app (Ask Atlas replays a recorded real traced run)
- Code: https://github.com/cqyestateyuki-prog/hackson_global_income
- Track: Money Operations · Built on PRISM by Block Convey · Models via Nicrron

## Elevator pitch
Side Atlas brings global side income into one multi-currency ledger, with a tax layer that organises the items you will probably need. It separates fees from withholding, compares form-style totals with payouts, and prepares a report for your accountant.

## Tagline
Global side income. One ledger. Tax items sorted.

## Problem
Side income arrives through platforms that take different cuts and pay in different currencies. Tax forms can show gross income rather than what landed, and payment processors can report the same money again.

Platform fees, withdrawal costs and FX spreads are hard to untangle. US platforms withhold nothing for US persons, leaving quarterly estimated taxes as a surprise.

## Solution
Drop multiple platform exports into Side Atlas; it detects each platform automatically. The ledger separates gross income, platform fees, payment fees, tax withheld and net income. Non-USD records use their own transaction date’s exchange rate. Missing rates stop processing instead of triggering a guess.

The tax layer shows withholding by platform and country, a set-aside at your chosen rate, the next US estimated-tax deadline, and an itemised forms-versus-bank comparison with possible-duplicate flags. An accountant checklist and export support the handoff.

Ask Atlas shows tool steps live, with every answer’s numbers linked to their source steps. Code calculates; AI orchestrates and explains.

The demo uses fictional data across eight platforms, with no live connections. Form types are simulated assumptions; Side Atlas does not calculate tax owed.

*Estimate only, not tax, legal, or financial advice.*

## How we used PRISM
- **Sessions:** Every run is traced, with every model and tool call recorded as a step. One v2 run shows 17 steps.
- **Alert:** Rules flag failed runs. Missing data stops the run and alerts a person rather than producing a guessed number.
- **Root Cause:** PRISM clustered 11 failed v1 runs. On the nine questions v1 answered incorrectly, v2 scored **9/9**. Per-trace analysis moved from **CRITICAL/HIGH** for missing-rate runs to **LOW** for explicit refusals.

## How we used Nicrron
Claude Fable 5.1 and Claude Opus 5.5 run the agent through Nicrron. GPT-6 Astra wrote all product copy. Google nano-banana-pro drew the Atlas mascot and app icon.

## What's next
Official API connections, email forwarding and bank matching are planned. Growth coaching remains roadmap-only.
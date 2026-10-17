# Side Atlas — design decisions

The single place where visual rulings live. Changing a ruling means a new kit version, not an edit to one component.

## v1 · 17 October 2026 — the standard

| # | Decision | Why |
|---|---|---|
| 1 | **Reference = Linktree for form, not colour; primary = forest green (user choice).** Borrowed from linktr.ee (measured 2026-10-17): big rounded cards, full-pill buttons, heavy rounded headline type, one bold colour field per screen. Not borrowed: Linktree's palette. | The user picked Linktree from the reference board (Gumroad / Linktree / Spotify Wrapped) for its creator feel, then asked for our own palette while keeping Linktree's deep forest green. |
| 2 | **Primary `#1F4B2C`** ("atlas forest"), shifted from Linktree's `#254F1A`. | Linktree's forest leans olive/yellow; we cooled it toward blue-green so it reads as map ink rather than Linktree, and it darkens slightly for white text on the hero (well above AA for large text). |
| 3 | **One bright accent: lime `#C5E35A`**, not Linktree's `#D2E823`. Large shapes, bars, dots, the countdown numeral only. | Softer, greener lime that sits with forest; keeping it off small text removes the "toy" risk the user saw on the board. |
| 4 | **Royal blue and maroon kept only with a job:** tax blue `#2F59C9` = tax withheld; maroon `#8C1D2C` = stopped / missing data. | Withholding must never look like a fee; a stop must look unlike everything else. Both shifted from Linktree's values. |
| 5 | **Neutrals:** page `#F6F4EC` warm off-white, sage `#E7EDDF`, surface white, ink `#18211B`. | Warm off-white / pale sage family as requested; ink is green-black so text belongs to the palette. |
| 6 | **Deduction colours:** platform fee clay `#B65A34`, payout fee stone `#9A8E78`, FX slate `#5D7685`, net forest. | Distinct hue per deduction; muted so a waterfall stays calm. |
| 7 | **Platform colours are ours** (lagoon, poppy, iris, orchid, moss, sun, graphite, cocoa), each with fill / tint / text-on-white. They appear only as dots, chips and the share bar; deduction colours never appear in the same chart. | Platforms' own brand colours would make the app look like a logo wall and clash with the semantic set. |
| 8 | **Font: Plus Jakarta Sans (OFL, variable 200–800)** as the free substitute for Link Sans; headlines 800 at −0.02em; body 500. Tabular figures verified (1111 and 0000 both 96.0px at 40px with `tabular-nums`). CJK falls back to PingFang SC / Noto Sans SC. | Closest free geometric-rounded grotesk with real tabular numerals; the user saw it on the board. |
| 9 | **Anti-toy rules:** one hero field per screen; money in ink/forest on light surfaces (a deduction may use its semantic text colour; the hero figure is white ≥48px on forest); never small text on lime; calm tables (white, hairlines, tabular, right-aligned). | Big colour + finance numbers looked like a toy on the board; these rules keep the creator feel without losing trust. |
| 10 | **Missing data is a full stop state** (maroon hero, named record, one action, totals marked incomplete). | Matches the product rule "stop, don't guess" and the PRISM alert story. |
| 11 | **Product copy by GPT-6 Astra** (tagline, hero lines, tax and forms copy, missing-data copy, report cover) via `scripts/astra.py`; UI labels written by hand. | User rule: all product copy comes from GPT-6 Astra. |
| 12 | **Desktop only, 1440×900.** | User choice for the demo. |

## Open TODOs (need sign-off or data)

- **Form view vs bank view uses placeholder numbers.** In `07-mockups/data.js` → `forms_placeholder`: form view = ledger gross, bank view = ledger net, gap = platform fee + payout fee + withheld; form types "1099-K (simulated)" for US platforms, "No US form · CN withholding record" for B站; the possible-duplicate flag on Patreon (PayPal payout) is invented for the mock. Replace with the `form_check` API output when it lands, and re-export `08-screens`.
- **Ask timeline order is illustrative.** The 11 steps and their results match the backend's verification run (find_creator → load_platform ×7 → convert_currency → compute_breakdown → submit_answer), but the order of the `load_platform` calls is drawn from the overview, not from the trace.
- **Logo text is live text**, not outlined; outline before print or app-store use.
- **No import/upload screen** (F1 partial), no set-aside rate editor, no Chinese-language Ask example, no mobile layout.
- FX loss versus mid-market is not modelled (the data has one rate per date), so the FX semantic colour is used for rate labels only.

# Side Atlas — design decisions

The single place where visual rulings live. Changing a ruling means a new kit version, not an edit to one component.

## v1.2 · 17 October 2026 — current standard

| # | Decision | Why |
|---|---|---|
| 19 | **Palette = soft violet `#6B5BC2` + pink `#FF7AB6`**, replacing forest green (supersedes #14). Names kept (`--sa-forest` = primary, `--sa-lime` = accent) so nothing renames. Neutrals: page `#F8F7FC`, sage `#EFEDF8`, ink `#191A2B`. | User picked "C · 电光紫 + 粉" toned down ("not too purple") from a 5-palette comparison. |
| 20 | **WCAG AA fixes:** on-primary secondary text `#F1EEFC` (4.71:1), pink figures on the hero `#FFC2DD` ≥24px only (3.59:1), meta `#696B83` (5.21:1), pink text on white `#C42F78` (5.22:1); bright pink `#FF7AB6` is decorative only. Twitch moved from violet to blue (`#3F9BD9`) so it doesn't read as the primary. | User asked whether contrast passes; measured, then fixed the four failures. |
| 21 | **Mascot "Atlas"**: a carrier pigeon with crescent ^ ^ smiling eyes, coin satchel and map scarf; flat 2D sticker style. Crescent eyes chosen to avoid Duolingo's white-ringed round eyes. Sizes are tokens (`--sa-mascot-hero/card/inline/avatar` = 128/84/56/40px) and the bird never sits near a money figure. | User wanted a Duolingo-like character with a Gen-Z / Pop Mart feel, then asked for it smaller. |
| 22 | **Logo = the pigeon-head app icon** (`02-logos/icon-256.png`, favicons in `app-icons-and-favicons/`); lockup text is just "Side Atlas" — 副业图谱 removed everywhere. The product references the mark from one place (`web/index.html`). Supersedes the v1 globe mark. | User decision. |
| 23 | **Nav = exactly four screens**: Overview 总览 · Ledger 账本 · Tax 税务 · Ask Atlas 问 Atlas. | User decision: fewer places to look. |
| 24 | **Merged, nothing unique removed:** Sources → "Import statements" drawer on Ledger; Set-aside settings → editable rate on the Tax hero (presets, slider, custom input, per-platform toggles under "Advanced"); Report → "Export for my accountant" on Tax (route kept, not in nav); "Other creators" sidebar → creator picker with a warn dot for creators with data issues. | User: keep every feature, give each one home. |
| 25 | **Duplicates removed:** Overview set-aside card (duplicated the Tax hero → one-line link to Tax); "Keeps the most of each dollar" card (duplicated the by-platform kept % → highlighted row); Ledger table total row (duplicated the KPI row, which now follows the platform filter); import panel record counts and date ranges (the Ledger shows them); Report "Included" checklist (re-explained the sheet). | One home for each piece of information. |
| 26 | **Clutter removed:** long Ledger and Report subtitles → the period label; Tax hero sub-sentence and forms sub-sentence (the title and table say it); Q3 "3 months" chip (the header says it); repeated agent steps collapse into range rows (`2–15 load_platform ×14`). | User: calmer, not poorer. |
| 27 | **Kept and given a home:** Patreon iOS simulation → small insight card on Overview (simulated 30% in-app cut); import panel: many files at once with platform auto-detection, where each export lives (typical paths, "paths may change"), what the check found; "Connect automatically — coming soon" (official APIs for YouTube, Twitch, Patreon, Upwork, PayPal; email forwarding for the rest) as disabled buttons. | Gathering the data is the hardest step for users. |
| 28 | Kit screens in `08-screens/` were not re-exported for v1.2; the product's own captures are in `web/_checks/v12-*.png`. | Time; the product is now the reference. |

## v1.1 · 17 October 2026

| # | Decision | Why |
|---|---|---|
| 13 | **Supersedes #10.** A stop keeps the forest hero (partial total, "Incomplete" chip) and adds a light warning card (`.sa-warncard`: warn tint, maroon only for label, icon, left rule and "missing"). The full maroon hero is retired. | User ruling after review: the full maroon block was too alarming. |
| 14 | Primary `#1F4B2C` confirmed. | User sign-off. |
| 15 | Form view vs bank view uses the real `form_check` output (`GET /api/forms`): forms $14,356.59 vs landed $11,956.06, gap $2,400.53; possible duplicate = Fiverr (PayPal payout); no 1099-K platform over the real $20,000 AND 200 threshold. Form types and the $2,000 1099-MISC example threshold stay labelled simulated. | User approved swapping in real numbers; resolves the v1 placeholder TODO. |
| 16 | New screens drawn: Sources (import), Set-aside settings, Ask in Chinese. The Chinese Ask steps come from a real v2 dry run (Opus 5.5, temperature 0, not traced): 21 tool calls. | User asked for the three missing screens. |
| 17 | Pages use colours only via `--sa-*` tokens (logo included); no hex outside `04-tokens`. | Coordinator note: the palette may be swapped (Instagram-style pink/purple is under consideration) by editing the token file only. |
| 18 | Icons 22 → 25: upload, sliders, file (Lucide, ISC). | Needed by Sources and Set-aside. |

## v1 · 17 October 2026 — the first standard

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
| 10 | ~~**Missing data is a full stop state**~~ (superseded by #13) (maroon hero, named record, one action, totals marked incomplete). | Matches the product rule "stop, don't guess" and the PRISM alert story. |
| 11 | **Product copy by GPT-6 Astra** (tagline, hero lines, tax and forms copy, missing-data copy, report cover) via `scripts/astra.py`; UI labels written by hand. | User rule: all product copy comes from GPT-6 Astra. |
| 12 | **Desktop only, 1440×900.** | User choice for the demo. |

## Open TODOs (need sign-off or data)

- ~~Form view vs bank view uses placeholder numbers~~ — done in v1.1 (#15).
- **Ask timeline order is illustrative.** The 11 steps and their results match the backend's verification run (find_creator → load_platform ×7 → convert_currency → compute_breakdown → submit_answer), but the order of the `load_platform` calls is drawn from the overview, not from the trace.
- **Logo text is live text**, not outlined; outline before print or app-store use.
- No mobile layout. (Import, set-aside editor and Chinese Ask were added in v1.1.)
- The English Ask timeline order is still illustrative; the Chinese Ask uses real steps.
- Palette may change (pink/purple under consideration): edit `04-tokens` only, then re-run `08-screens/capture.sh` and print the spec.
- FX loss versus mid-market is not modelled (the data has one rate per date), so the FX semantic colour is used for rate labels only.

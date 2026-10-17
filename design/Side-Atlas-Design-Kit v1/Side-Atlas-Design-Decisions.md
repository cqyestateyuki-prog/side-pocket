# Side Atlas — design decisions

The single place where visual rulings live. Changing a ruling means a new kit version, not an edit to one component.

## v1.3 · 17 October 2026 · current standard (drawn; waiting for sign-off before build)

| # | Decision | Why |
|---|---|---|
| 30 | **Your data = upload statements only.** People bring their income as the CSV exports of the 8 platforms; no manual entry form. Screens 10 (empty) and 11 (after import). | User decision ("只做上传账单"). |
| 31 | **Privacy model: browser storage, stateless server.** Statements, records and settings live in this browser; the server calculates on request and keeps no copy; no account. "Delete all my data" clears the browser (nothing to delete on the server); "Export backup" downloads one JSON file. | User decision ("浏览器存 + 服务器只算不存"). |
| 32 | **What leaves the device.** Account IDs become `<Platform> · acct ••NN` in the browser (two digits of a salted hash) before any request. Ask Atlas gets monthly totals by platform with those labels, never names, account IDs, order numbers or files. PRISM traces in Your data mode are content-free (tool names, timings, pass or fail). Demo data keeps full traces for the PRISM story. | Privacy with the AI and tracing still useful. |
| 33 | **Tax home US / China / Both; display currency USD / CNY.** CNY view: CNY records stay native, USD records × that day's CNY-per-USD rate, summed unrounded and rounded half-up once (platform rows can differ from a total by a cent). China tax home: Bilibili's withholding, countdown to the annual filing window (Mar 1 to Jun 30 of the next year), income from platforms outside China flagged for the accountant; no Chinese tax is calculated. A China-only tax home hides US estimated-tax dates and the forms check. | User decision ("美国 + 中国，美元/人民币可切"); not tax advice. |
| 34 | **Nav stays at four.** A Your data / Demo data switch sits under the logo; My data and Settings & privacy are utility links in the sidebar foot, not nav items. In Your data mode the PRISM chip reads "Content-free PRISM traces"; the who-pill is "You", with a lock. | Coordinator directive; the mode must be visible on every screen. |
| 35 | **Eleven components added** (spec §4): data switch, utility links, upload hero (dashed inner rule, still the one hero), privacy promise strip, where-to-download grid, upload list, settings sheet, currency switch, privacy center map, danger button (white, warn text, never filled), grouped table rows; plus Atlas's speech bubble for empty states. Icons 25 → 30: shield, lock, trash, server, monitor (Lucide, ISC). | Needed by screens 10 to 14. |
| 36 | **Kit shell = product shell.** The prototype now uses the pigeon logo, the four-item nav and the mascot (copied to `02-logos/mascot/`); `05-css/side-atlas-ui-reference.css` is synced with the token-only product copy. PNGs 01–08 stay v1.1 captures; `bash 08-screens/capture.sh` re-draws them with the new shell, `capture.sh v13` exports only 10 to 14. The kit disclaimer now matches the product ("Estimate only. Not tax, legal, or financial advice."). | One shell to build from. |
| 37 | **Copy** for the new screens is GPT-6 Astra's, in two passes (`07-mockups/copy-v13.js`), except one privacy line where the draft was clearer than Astra's fragments (noted in the file). Numbers come from `07-mockups/gen_data_v13.py` (read-only use of `daoshou/ledger.py`). | User rule: product copy by Astra; numbers by code. |

### Open for sign-off (v1.3)

- **Tax home "Both":** proposed one hero with two countdowns (US Jan 15, 2027 · China Mar 1, 2027) and both sections stacked. Not drawn.
- **Pseudonym length:** `acct ••NN` (2 digits) can collide when someone has many accounts on one platform; 4 characters would avoid that.
- **Empty states in Your data mode** before any import: proposed a small card on Overview, Ledger, Tax and Ask that links to My data. Not drawn.
- **Ledger in CNY:** proposed a CNY column next to the original amount, with the rate and date under it, as for CNY → USD today. Not drawn.
- **Delete confirmation:** proposed one dialog with "Export backup first" as the secondary action.
- **Backend rounding:** the CNY view must round once at the total like the USD ledger (decision #33); the backend agent should match it.
- **Rate source label:** the backend in progress can fill missing rates from ECB reference rates (`daoshou/fx.py`); the ledger then needs a small label saying where each rate came from (your file or the ECB reference). Not drawn.

## v1.2 · 17 October 2026

| # | Decision | Why |
|---|---|---|
| 19 | **Palette = soft violet `#6B5BC2` + pink `#FF7AB6`**, replacing forest green (supersedes #14). Names kept (`--sa-forest` = primary, `--sa-lime` = accent) so nothing renames. Neutrals: page `#F8F7FC`, sage `#EFEDF8`, ink `#191A2B`. | User picked "C · 电光紫 + 粉" toned down ("not too purple") from a 5-palette comparison. |
| 20 | **WCAG AA fixes:** on-primary secondary text `#F1EEFC` (4.71:1), pink figures on the hero `#FFC2DD` ≥24px only (3.59:1), meta `#696B83` (5.21:1), pink text on white `#C42F78` (5.22:1); bright pink `#FF7AB6` is decorative only. Twitch moved from violet to blue (`#3F9BD9`) so it doesn't read as the primary. | User asked whether contrast passes; measured, then fixed the four failures. |
| 21 | **Mascot "Atlas"**: a carrier pigeon with crescent ^ ^ smiling eyes, coin satchel and map scarf; flat 2D sticker style. Crescent eyes chosen to avoid Duolingo's white-ringed round eyes. Sizes are tokens (`--sa-mascot-hero/card/inline/avatar` = 128/84/56/40px) and the bird never sits near a money figure. | User wanted a Duolingo-like character with a Gen-Z / Pop Mart feel, then asked for it smaller. |
| 22 | **Logo = the pigeon-head app icon** (`02-logos/icon-256.png`, favicons in `app-icons-and-favicons/`); lockup text is just "Side Atlas" — 副业图谱 removed everywhere. The product references the mark from one place (`web/index.html`). Supersedes the v1 globe mark. | User decision. |
| 23 | **Nav = exactly four screens** (bilingual labels dropped by #29): Overview 总览 · Ledger 账本 · Tax 税务 · Ask Atlas 问 Atlas. | User decision: fewer places to look. |
| 24 | **Merged, nothing unique removed:** Sources → "Import statements" drawer on Ledger; Set-aside settings → editable rate on the Tax hero (presets, slider, custom input, per-platform toggles under "Advanced"); Report → "Export for my accountant" on Tax (route kept, not in nav); "Other creators" sidebar → creator picker with a warn dot for creators with data issues. | User: keep every feature, give each one home. |
| 25 | **Duplicates removed:** Overview set-aside card (duplicated the Tax hero → one-line link to Tax); "Keeps the most of each dollar" card (duplicated the by-platform kept % → highlighted row); Ledger table total row (duplicated the KPI row, which now follows the platform filter); import panel record counts and date ranges (the Ledger shows them); Report "Included" checklist (re-explained the sheet). | One home for each piece of information. |
| 26 | **Clutter removed:** long Ledger and Report subtitles → the period label; Tax hero sub-sentence and forms sub-sentence (the title and table say it); Q3 "3 months" chip (the header says it); repeated agent steps collapse into range rows (`2–15 load_platform ×14`). | User: calmer, not poorer. |
| 27 | **Kept and given a home:** Patreon iOS simulation → small insight card on Overview (simulated 30% in-app cut); import panel: many files at once with platform auto-detection, where each export lives (typical paths, "paths may change"), what the check found; "Connect automatically — coming soon" (official APIs for YouTube, Twitch, Patreon, Upwork, PayPal; email forwarding for the rest) as disabled buttons. | Gathering the data is the hardest step for users. |
| 28 | Kit screens in `08-screens/` were not re-exported for v1.2; the product's own captures are in `web/_checks/v12-*.png`. | Time; the product is now the reference. |
| 29 | **UI is single-language (English for the demo); no bilingual labels; language switch deferred.** Nav labels English only; the English/中文 switch and the Chinese Ask screen are removed from the UI (the recorded Chinese run stays on disk at `web/demo/ask-c01-zh.json`). Source data keeps "B站", Chinese record types and names because the graded questions expect them; the UI maps them at display time (`web/lib/display.js`): B站 → Bilibili, 充电 → Power-up, 礼物 → Gift, SC → Super Chat, 舰长/提督/总督 → Captain/Admiral/Governor (guard), 提现代扣个税 → Tax withheld at withdrawal; creators with Chinese names show romanised display names (Moon Spirit, Xiao Lu, A You, Mo Bai). | User rule (2026-10-17): "English is English, Chinese is Chinese — never mixed". |

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

# Side Atlas Design Kit

Everything needed to build Side Atlas's look and feel: the spec, logos, icons, tokens, code, fonts, a clickable prototype and screen images. Version 1.3.1, 17 October 2026, desktop only.

Start with `01-spec/Side-Atlas-Look-and-Feel-Spec.pdf`. Then open `07-mockups/app.html` in a browser (works offline; switch screens in the left nav and the Your data / Demo data switch, or with `#overview`, `#ledger`, `#tax`, `#ask`, `#report`, `#sources`, `#settings`, `#missing`, and for v1.3 `#mydata-empty`, `#mydata`, `#privacy`, `#privacy-delete`, `#tax-cn`, `#tax-both`, `#overview-cny`, `#overview-empty`, `#ledger-cny`; `?screen=<name>` works too).

## What's new in v1.3.1

- Privacy lines rewritten to match the build: labels made in the browser before upload, a server that calculates in memory and keeps no copy, Ask Atlas with computed totals and labels only, PRISM with tool names, timings and pass or fail only, and a new privacy-center row for ECB exchange rates (currency codes and a date range only).
- Labels have four digits: `Upwork · acct ••7426`.
- New drawings: 12b delete confirmation, 15 Tax with tax home Both, 16 empty state before any import, 17 Ledger in CNY with a rate line and the missing-rate stop. Six components added (decisions #38 to #44).
- 01 to 08 re-captured with the new shell.

## What's new in v1.3

- **Your data mode:** upload statements only (CSV exports of the 8 platforms); a Your data / Demo data switch under the logo; nav stays at four, with My data and Settings & privacy as utility links in the sidebar foot.
- **Privacy:** records and settings in this browser, a server that calculates and keeps nothing, no account; Ask Atlas sees monthly totals by platform with labels like `Upwork · acct ••26`; PRISM traces are content-free; Delete all my data and Export backup.
- **Tax home US / China / Both, display currency USD / CNY:** China tax home shows Bilibili's withholding, the annual filing window countdown and a flag for income from platforms outside China.
- **Screens 10 to 14** (`08-screens/desktop/10-…14-*.png`, plus `13b` full length), eleven new components, icons 25 → 30. Decisions #30 to #37 and the open questions are in the decision log.

## What's new in v1.2

- Palette: soft violet #6B5BC2 + pink #FF7AB6 (replaces forest green), WCAG AA fixes for four pairs.
- Mascot Atlas (pigeon, crescent ^ ^ eyes, flat sticker style) with size tokens; logo = the pigeon-head app icon; lockup text "Side Atlas" only.
- Nav cut to four screens (Overview, Ledger, Tax, Ask Atlas). Sources → Import statements drawer on Ledger; set-aside settings → editable rate on the Tax hero; Report → Export button on Tax; other creators → creator picker with a warn dot.
- Duplicates merged and clutter removed (see decisions #19–#28). Kit PNGs were not re-exported; the product captures in web/_checks/v12-*.png are the reference.

## What's new in v1.1

- Stop state: forest hero kept, light warning card instead of the full maroon hero (user ruling).
- Tax items: real form-vs-bank numbers from `GET /api/forms` (Fiverr → PayPal possible duplicate; no 1099-K expected; form types simulated).
- New screens: 07 Sources (import), 08 Set-aside settings (interactive), 09 Ask in Chinese.
- Icons 22 → 25 (upload, sliders, file); prototype colours only via `--sa-*` tokens.

## Folders

| Folder | What's inside | Who uses it |
|---|---|---|
| `01-spec` | The spec (HTML source + PDF): brand test, principles, logo and icons, tokens, palette, components, every screen, fix list, implementation, release checks. | Everyone |
| `02-logos` | App icon (`icon-256.png`), favicons, the v1 globe mark and lockups (superseded), letters-only wordmark, and Atlas the mascot in `mascot/` (wave, think, worried, celebrate). | Design, engineering |
| `03-icons` | 30 icons as SVGs, one sprite, `side-atlas-icons.js`, `preview.html`. Adapted from Lucide (ISC). All use `currentColor`. No emoji. | Design, engineering |
| `04-tokens` | `side-atlas-tokens.json` (W3C design tokens; Tokens Studio → Figma), `.css` (`--sa-*` custom properties), `.js`. | Design, engineering |
| `05-css` | `side-atlas-align.css`: drop-in base (fonts, tokens, type, pill buttons, tabular numbers). `side-atlas-ui-reference.css`: the component styles the prototype uses. | Engineering |
| `06-fonts` | Plus Jakarta Sans variable woff2 (latin + latin-ext), `side-atlas-fonts.css`, OFL licence. | Engineering |
| `07-mockups` | `app.html` (the desktop app, 17 screens), `data.js` (real numbers from the fictional test set via `daoshou/ledger.py`), `data-v13.js` + `gen_data_v13.py` (the v1.3 Your data numbers, CNY view and China split), `copy-v13.js` (GPT-6 Astra copy for v1.3). | Everyone |
| `08-screens` | `desktop/` PNGs at 1440×900 in flow order (+ full-length tax screens), and `capture.sh` to re-export them with headless Chrome (`capture.sh v13` for screens 10 to 17 only). 01 to 08 show the v1.1 drawings in the v1.3 shell. | Design, product |

## The rules in one place

- **Shapes:** cards 24px, inner panels 16px, inputs 14px, badges 8px; buttons, chips and segmented controls are full pills.
- **Colour:** one bold field per screen, always forest. Everything else white, sage or a light tint. Lime is a shape, never small text. Pages use only `--sa-*` tokens, so a palette change is a token-file edit.
- **Money:** ink or forest on light surfaces, tabular, right-aligned in tables. Fees (clay, stone) and tax withheld (tax blue) never share a colour.
- **Buttons:** primary forest pill; pressed sinks 1px and darkens; secondary white with a strong line; selected forest-100.
- **Logo (v1.2):** the pigeon-head app icon (Atlas the mascot on a violet rounded square, `02-logos/icon-256.png`) + "Side Atlas" 800. No Chinese name in the lockup. The v1 globe SVGs in `02-logos/` are superseded.
- **Icons:** the 30 in `03-icons`, currentColor, 2px stroke. No emoji.
- **Stops:** missing data shows a light warning card beside the forest hero, names the record, leaves it out of totals (marked incomplete). Nothing is estimated.
- **Your data (v1.3.1):** nothing that names a person or an account leaves the browser; accounts show as `acct ••NNNN`. Delete is a white danger pill; only the confirm button inside the delete dialog is filled.
- **Rates (v1.3.1):** every converted amount shows its rate, the rate's date and its source.

## Quick start for engineering

```css
@import "./05-css/side-atlas-align.css";          /* fonts + tokens + base */
@import "./05-css/side-atlas-ui-reference.css";   /* component classes (.sa-card, .sa-hero, .sa-table …) */
```

```html
<script src="./03-icons/side-atlas-icons.js"></script>
<svg class="sa-icon"><use href="#sa-i-tax"/></svg>
```

Decisions and open TODOs: `Side-Atlas-Design-Decisions.md`.

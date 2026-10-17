# Side Atlas Design Kit

Everything needed to build Side Atlas's look and feel: the spec, logos, icons, tokens, code, fonts, a clickable prototype and screen images. Version 1.1, 17 October 2026, desktop only.

Start with `01-spec/Side-Atlas-Look-and-Feel-Spec.pdf`. Then open `07-mockups/app.html` in a browser (works offline; switch screens in the left nav, or with `#overview`, `#ledger`, `#tax`, `#ask`, `#ask-zh`, `#report`, `#sources`, `#settings`, `#missing`, or `?screen=<name>`).

## What's new in v1.1

- Stop state: forest hero kept, light warning card instead of the full maroon hero (user ruling).
- Tax items: real form-vs-bank numbers from `GET /api/forms` (Fiverr → PayPal possible duplicate; no 1099-K expected; form types simulated).
- New screens: 07 Sources (import), 08 Set-aside settings (interactive), 09 Ask in Chinese.
- Icons 22 → 25 (upload, sliders, file); prototype colours only via `--sa-*` tokens.

## Folders

| Folder | What's inside | Who uses it |
|---|---|---|
| `01-spec` | The spec (HTML source + PDF): brand test, principles, logo and icons, tokens, palette, components, every screen, fix list, implementation, release checks. | Everyone |
| `02-logos` | Mark, lockup (light and on forest), favicon, letters-only wordmark. | Design, engineering |
| `03-icons` | 25 icons as SVGs, one sprite, `side-atlas-icons.js`, `preview.html`. Adapted from Lucide (ISC). All use `currentColor`. No emoji. | Design, engineering |
| `04-tokens` | `side-atlas-tokens.json` (W3C design tokens; Tokens Studio → Figma), `.css` (`--sa-*` custom properties), `.js`. | Design, engineering |
| `05-css` | `side-atlas-align.css`: drop-in base (fonts, tokens, type, pill buttons, tabular numbers). `side-atlas-ui-reference.css`: the component styles the prototype uses. | Engineering |
| `06-fonts` | Plus Jakarta Sans variable woff2 (latin + latin-ext), `side-atlas-fonts.css`, OFL licence. | Engineering |
| `07-mockups` | `app.html` (the whole desktop app, 9 screens) and `data.js` (real numbers computed from the fictional test set with `daoshou/ledger.py`). | Everyone |
| `08-screens` | `desktop/` PNGs at 1440×900 in flow order (+ a full-length tax screen), and `capture.sh` to re-export them with headless Chrome. | Design, product |

## The rules in one place

- **Shapes:** cards 24px, inner panels 16px, inputs 14px, badges 8px; buttons, chips and segmented controls are full pills.
- **Colour:** one bold field per screen, always forest. Everything else white, sage or a light tint. Lime is a shape, never small text. Pages use only `--sa-*` tokens, so a palette change is a token-file edit.
- **Money:** ink or forest on light surfaces, tabular, right-aligned in tables. Fees (clay, stone) and tax withheld (tax blue) never share a colour.
- **Buttons:** primary forest pill; pressed sinks 1px and darkens; secondary white with a strong line; selected forest-100.
- **Logo:** lime globe on a forest rounded square + "Side Atlas" 800 + 副业图谱. Never on lime.
- **Icons:** the 25 in `03-icons`, currentColor, 2px stroke. No emoji.
- **Stops:** missing data shows a light warning card beside the forest hero, names the record, leaves it out of totals (marked incomplete). Nothing is estimated.

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

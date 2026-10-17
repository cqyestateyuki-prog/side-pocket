# Side Atlas Design Kit

Everything needed to build Side Atlas's look and feel: the spec, logos, icons, tokens, code, fonts, a clickable prototype and screen images. Version 1, 17 October 2026, desktop only.

Start with `01-spec/Side-Atlas-Look-and-Feel-Spec.pdf`. Then open `07-mockups/app.html` in a browser (works offline; switch screens in the left nav, or with `#overview`, `#ledger`, `#tax`, `#ask`, `#report`, `#missing`, or `?screen=<name>`).

## Folders

| Folder | What's inside | Who uses it |
|---|---|---|
| `01-spec` | The spec (HTML source + PDF): brand test, principles, logo and icons, tokens, palette, components, every screen, fix list, implementation, release checks. | Everyone |
| `02-logos` | Mark, lockup (light and on forest), favicon, letters-only wordmark. | Design, engineering |
| `03-icons` | 22 icons as SVGs, one sprite, `side-atlas-icons.js`, `preview.html`. Adapted from Lucide (ISC). All use `currentColor`. No emoji. | Design, engineering |
| `04-tokens` | `side-atlas-tokens.json` (W3C design tokens; Tokens Studio → Figma), `.css` (`--sa-*` custom properties), `.js`. | Design, engineering |
| `05-css` | `side-atlas-align.css`: drop-in base (fonts, tokens, type, pill buttons, tabular numbers). `side-atlas-ui-reference.css`: the component styles the prototype uses. | Engineering |
| `06-fonts` | Plus Jakarta Sans variable woff2 (latin + latin-ext), `side-atlas-fonts.css`, OFL licence. | Engineering |
| `07-mockups` | `app.html` (the whole desktop app, 6 screens) and `data.js` (real numbers computed from the fictional test set with `daoshou/ledger.py`). | Everyone |
| `08-screens` | `desktop/` PNGs at 1440×900 in flow order (+ a full-length tax screen), and `capture.sh` to re-export them with headless Chrome. | Design, product |

## The rules in one place

- **Shapes:** cards 24px, inner panels 16px, inputs 14px, badges 8px; buttons, chips and segmented controls are full pills.
- **Colour:** one bold field per screen (forest; maroon only when stopped). Everything else white or sage. Lime is a shape, never small text.
- **Money:** ink or forest on light surfaces, tabular, right-aligned in tables. Fees (clay, stone) and tax withheld (tax blue) never share a colour.
- **Buttons:** primary forest pill; pressed sinks 1px and darkens; secondary white with a strong line; selected forest-100.
- **Logo:** lime globe on a forest rounded square + "Side Atlas" 800 + 副业图谱. Never on lime.
- **Icons:** the 22 in `03-icons`, currentColor, 2px stroke. No emoji.
- **Stops:** missing data turns the hero maroon, names the record, leaves it out of totals. Nothing is estimated.

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

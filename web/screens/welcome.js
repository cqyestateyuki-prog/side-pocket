// Welcome: the demo entry screen. There is no real sign-in — no email or password is ever asked
// for; "Continue with the demo account" opens the fictional Moon Spirit ledger.
import { icon } from "../lib/format.js";
import { mascot } from "../lib/mascot.js";
import { setEntered } from "../lib/prefs.js";

// Copy from GPT-6 Astra (docs/submission.md, "Tagline" and "Solution"), reused near-verbatim.
const TAGLINE = "Global side income. One ledger. Tax items sorted.";
const POINTS = [
  ["upload", "Drop multiple platform exports; Side Atlas detects each platform automatically."],
  ["ledger", "Gross income, platform fees, payment fees, tax withheld and net, kept separate."],
  ["calendar", "A set-aside at your chosen rate and the next US estimated-tax deadline."],
];

export async function render() {
  return `<div class="sa-welcome">
    <section class="wl-brand">
      <div class="wl-logo"><img src="assets/logo/icon-96.png" alt="" width="44" height="44"><b>Side Atlas</b></div>
      <h1>${TAGLINE.split(/(?<=\.) /).map(line => `<span>${line}</span>`).join("")}</h1>
      <ul class="wl-points">${POINTS.map(([i, t]) => `<li>${icon(i)}<span>${t}</span></li>`).join("")}</ul>
      ${mascot("wave", "wl-mascot")}
    </section>
    <section class="wl-panel">
      <div class="wl-card">
        <h2>Welcome</h2>
        <div class="wl-account"><div class="av">M</div><div><b>Moon Spirit</b><span>fictional data</span></div></div>
        <button class="sa-btn primary wl-go" type="button" data-enter>Continue with the demo account</button>
        <button class="sa-btn secondary wl-alt" type="button" disabled>Sign in with Google — coming soon</button>
        <p class="wl-foot">Fictional demo data · Estimate only — not tax, legal, or financial advice.</p>
        <span class="sa-prism wl-built"><i></i>Built on PRISM · Models via Nicrron</span>
        <a class="wl-about" href="landing.html">About Side Atlas</a>
      </div>
    </section>
  </div>`;
}

export function mount(ctx, el) {
  el.querySelector("[data-enter]").addEventListener("click", () => {
    setEntered(true);
    location.hash = "#overview";
  });
}

// Welcome: the demo entry screen. There is no real sign-in — no email or password is ever asked
// for; "Continue with the demo account" opens the fictional Moon Spirit ledger.
import { icon } from "../lib/format.js";
import { mascot } from "../lib/mascot.js";
import { setEntered } from "../lib/prefs.js";

// Copy from GPT-6 Astra (welcome rewrite after the rename to Side Pocket, 2026-10-17).
const TAGLINE = "Side Pocket tracks your global side income.";
const POINTS = [
  ["upload", "Upload exports from 8 platforms, with each platform detected automatically."],
  ["ledger", "See gross, platform fees, payout fees, tax withheld and net for each platform."],
  ["calendar", "Choose your set-aside rate and see the next US estimated-tax date."],
];

export async function render() {
  return `<div class="sa-welcome">
    <section class="wl-brand">
      <div class="wl-logo"><img src="assets/logo/icon-96.png" alt="" width="44" height="44"><b>Side Pocket</b></div>
      <h1>${TAGLINE.split(/(?<=\.) /).map(line => `<span>${line}</span>`).join("")}</h1>
      <ul class="wl-points">${POINTS.map(([i, t]) => `<li>${icon(i)}<span>${t}</span></li>`).join("")}</ul>
      ${mascot("wave", "wl-mascot")}
    </section>
    <section class="wl-panel">
      <div class="wl-card">
        <h2>Welcome</h2>
        <div class="wl-account"><div class="av">M</div><div><b>Moon Spirit</b><span>New York · designer</span></div></div>
        <button class="sa-btn primary wl-go" type="button" data-enter>Continue as Moon Spirit</button>
        <button class="sa-btn secondary wl-alt" type="button" disabled>Sign in with Google (coming soon)</button>
        <p class="wl-foot">Estimate only. Not tax, legal, or financial advice.</p>
        <span class="sa-prism wl-built"><i></i>Built on PRISM · Models via Nicrron</span>
        <a class="wl-about" href="landing.html">About Side Pocket</a>
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

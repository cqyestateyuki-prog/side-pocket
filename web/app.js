// Side Atlas front end: hash router + shared shell (nav, creator switcher, period switcher).
// Screens live in screens/*.js and register below; each exports render(ctx) -> Promise<html>
// and may export mount(ctx) to wire up events after the html is in the page.
import { COPY } from "./lib/copy.js";
import { get } from "./lib/api.js";
import { esc, icon, monthShort } from "./lib/format.js";
import * as overview from "./screens/overview.js";
import * as ledger from "./screens/ledger.js";
import * as tax from "./screens/tax.js";
import * as ask from "./screens/ask.js";
import * as report from "./screens/report.js";

// To add a screen: import it and add a row. `period` is "month" (Jul/Aug/Sep/Q3) or null.
const SCREENS = [
  { key: "overview", label: "Overview", icon: "overview", module: overview, period: "month" },
  { key: "ledger", label: "Ledger", icon: "ledger", module: ledger, period: "month" },
  { key: "tax", label: "Tax items", icon: "tax", module: tax, period: "quarter" },
  { key: "ask", label: "Ask", icon: "ask", module: ask, period: null },
  { key: "report", label: "Report", icon: "report", module: report, period: "quarter" },
];

// Other creators surfaced in the sidebar, each opened on a specific screen and period.
const SHORTCUTS = [{ creator: "C11", screen: "overview", period: "2026-08", label: "Lena · Aug" }];

const DEFAULTS = { c: "C01", month: "2026-09", quarter: "2026-Q3" };
const PERIODS = ["2026-07", "2026-08", "2026-09", "2026-Q3"];

// How each fictional creator is introduced in the UI (labels only — no money).
const PERSONA = {
  C01: { display: "Moon Spirit", cjk: "月", meta: "New York · US tax home · single-member LLC" },
  C11: { display: "Lena Koch", meta: "Berlin · DE tax home" },
};

export function persona(c) {
  const p = PERSONA[c.id] ?? {};
  const cjk = p.cjk ?? (/[一-鿿]/.test(c.name) ? c.name[0] : null);
  return { display: p.display ?? c.name, cjk, meta: p.meta ?? `${c.tax_country} tax home`, name: c.name };
}

function parse() {
  const [screen, query = ""] = location.hash.slice(1).split("?");
  const q = new URLSearchParams(query);
  const def = SCREENS.find(s => s.key === screen) ?? SCREENS[0];
  const period = q.get("p") ?? (def.period === "quarter" ? DEFAULTS.quarter : DEFAULTS.month);
  return { screen: def, creator: q.get("c") ?? DEFAULTS.c, period, query: q };
}

export function href(screen, params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return `#${screen}${q.toString() ? "?" + q : ""}`;
}

function periodFor(target, current) {
  // Keep the user's period when the target screen understands it.
  if (target.period === null) return null;
  return PERIODS.includes(current) ? current : (target.period === "quarter" ? DEFAULTS.quarter : DEFAULTS.month);
}

export function periodSeg(ctx) {
  return `<div class="sa-seg">${PERIODS.map(p => `<a href="${href(ctx.screen.key, { c: ctx.creator, p })}" class="${p === ctx.period ? "on" : ""}">${p.includes("Q") ? "Q3 2026" : monthShort(p)}</a>`).join("")}</div>`;
}

export function whoPill(ctx) {
  const me = ctx.creators.find(c => c.id === ctx.creator) ?? ctx.creators[0];
  const p = persona(me);
  return `<label class="sa-who picker" title="Switch creator">
    <div class="av">${p.cjk ? `<span class="cjk">${esc(p.cjk)}</span>` : esc(p.display[0])}</div>
    <div><b>${esc(p.display)}</b><span>${esc(p.meta)}</span></div>
    ${icon("chevron", "sm chev")}
    <select data-creator-switch aria-label="Creator">${ctx.creators.map(c => `<option value="${c.id}" ${c.id === me.id ? "selected" : ""}>${esc(persona(c).display)}${persona(c).display !== c.name ? ` · ${esc(c.name)}` : ""}</option>`).join("")}</select>
  </label>`;
}

let renderSeq = 0;

async function go() {
  const seq = ++renderSeq;
  const route = parse();
  const main = document.getElementById("main");
  const creators = await get("creators");
  const ctx = { ...route, creators, me: creators.find(c => c.id === route.creator) ?? creators[0], href, periodSeg, whoPill, persona };

  renderNav(ctx);
  main.classList.add("loading");
  try {
    const html = await ctx.screen.module.render(ctx);
    if (seq !== renderSeq) return;
    main.innerHTML = html;
    main.scrollTop = 0;
    ctx.screen.module.mount?.(ctx, main);
  } catch (e) {
    if (seq !== renderSeq) return;
    main.innerHTML = `<div class="sa-card sa-error">${icon("alert")} <div><b>Couldn’t load this screen.</b><div class="meta">${esc(e.message)}</div></div></div>`;
  } finally {
    main.classList.remove("loading");
  }
  main.querySelector("[data-creator-switch]")?.addEventListener("change", ev => {
    location.hash = href(ctx.screen.key, { c: ev.target.value, p: ctx.screen.period ? ctx.period : null });
  });
}

async function renderNav(ctx) {
  const nav = document.getElementById("nav");
  const items = SCREENS.map(s => {
    const on = s.key === ctx.screen.key && !SHORTCUTS.some(x => x.creator === ctx.creator && x.screen === s.key && x.period === ctx.period);
    return `<a href="${href(s.key, { c: ctx.creator === "C11" ? null : ctx.creator, p: periodFor(s, ctx.period) })}" class="${on ? "on" : ""}">${icon(s.icon)}${s.label}</a>`;
  });
  const shortcuts = await Promise.all(SHORTCUTS.map(async x => {
    const o = await get("overview", { creator: x.creator, month: x.period }).catch(() => null);
    const on = ctx.creator === x.creator && ctx.screen.key === x.screen && ctx.period === x.period;
    const n = o?.issues?.length ?? 0;
    return `<a href="${href(x.screen, { c: x.creator, p: x.period })}" class="${on ? "on" : ""}">${icon(n ? "alert" : "overview")}${esc(x.label)}${n ? `<span class="count">${n}</span>` : ""}</a>`;
  }));
  nav.innerHTML = items.join("") + `<div class="label nav-label">Other creators</div>` + shortcuts.join("");
}

document.getElementById("tagline").textContent = COPY.TAGLINE;
document.getElementById("disclaimer").textContent = COPY.DISCLAIMER;
window.addEventListener("hashchange", go);
go();

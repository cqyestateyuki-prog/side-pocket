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

// The nav has exactly four screens (user decision). `period` is "month" (Jul/Aug/Sep/Q3) or null.
// The accountant report is reached from Tax ("Export for my accountant"), not from the nav.
const SCREENS = [
  { key: "overview", label: "Overview", cn: "总览", icon: "overview", module: overview, period: "month" },
  { key: "ledger", label: "Ledger", cn: "账本", icon: "ledger", module: ledger, period: "month" },
  { key: "tax", label: "Tax", cn: "税务", icon: "tax", module: tax, period: "quarter" },
  { key: "ask", label: "Ask Atlas", cn: "问 Atlas", icon: "ask", module: ask, period: null },
  { key: "report", label: "Report", icon: "report", module: report, period: "quarter", nav: false, navAs: "tax" },
];

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

const issueText = c => c.data_issues?.length
  ? `${c.data_issues.reduce((n, i) => n + i.count, 0)} record${c.data_issues.length === 1 && c.data_issues[0].count === 1 ? "" : "s"} need${c.data_issues.length === 1 && c.data_issues[0].count === 1 ? "s" : ""} a rate · ${monthShort(c.data_issues[0].month)}`
  : "";

export function whoPill(ctx) {
  const me = ctx.creators.find(c => c.id === ctx.creator) ?? ctx.creators[0];
  const p = persona(me);
  const warn = me.data_issues?.length;
  return `<label class="sa-who picker" title="${warn ? esc(issueText(me)) : "Switch creator"}">
    <div class="av">${p.cjk ? `<span class="cjk">${esc(p.cjk)}</span>` : esc(p.display[0])}${warn ? `<i class="warn-dot" aria-label="Has data issues"></i>` : ""}</div>
    <div><b>${esc(p.display)}</b><span>${esc(warn ? issueText(me) : p.meta)}</span></div>
    ${icon("chevron", "sm chev")}
    <select data-creator-switch aria-label="Creator">${ctx.creators.map(c => `<option value="${c.id}" ${c.id === me.id ? "selected" : ""}>${esc(persona(c).display)}${persona(c).display !== c.name ? ` · ${esc(c.name)}` : ""}${c.data_issues?.length ? ` — ${esc(issueText(c))}` : ""}</option>`).join("")}</select>
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
    // A creator with unconvertible records opens on the month that needs attention.
    const next = creators.find(c => c.id === ev.target.value);
    const issueMonth = ctx.screen.period === "month" ? next?.data_issues?.[0]?.month : null;
    location.hash = href(ctx.screen.key, { c: ev.target.value, p: issueMonth ?? (ctx.screen.period ? ctx.period : null) });
  });
}

function renderNav(ctx) {
  const current = ctx.screen.navAs ?? ctx.screen.key;
  document.getElementById("nav").innerHTML = SCREENS.filter(s => s.nav !== false).map(s =>
    `<a href="${href(s.key, { c: ctx.creator === DEFAULTS.c ? null : ctx.creator, p: periodFor(s, ctx.period) })}" class="${s.key === current ? "on" : ""}">${icon(s.icon)}<span>${s.label}</span><span class="cn">${s.cn}</span></a>`).join("");
}

document.getElementById("tagline").textContent = COPY.TAGLINE;
document.getElementById("disclaimer").textContent = COPY.DISCLAIMER;
window.addEventListener("hashchange", go);
go();

// Side Atlas front end: hash router + shared shell (nav, data switch, creator switcher, period switcher).
// Screens live in screens/*.js and register below; each exports render(ctx) -> Promise<html>
// and may export mount(ctx) to wire up events after the html is in the page.
// Two ledgers: "Demo data" (the fictional creators, GET /api/*) and "Your data" (statements uploaded
// in this browser, POST /api/personal/*). Screens ask ctx.load() and don't care which.
import { COPY } from "./lib/copy.js";
import { get } from "./lib/api.js";
import { cur, esc, icon, monthShort, quarterOf } from "./lib/format.js";
import * as overview from "./screens/overview.js";
import * as ledger from "./screens/ledger.js";
import * as tax from "./screens/tax.js";
import * as ask from "./screens/ask.js";
import * as report from "./screens/report.js";
import * as welcome from "./screens/welcome.js";
import * as mydata from "./screens/mydata.js";
import * as settings from "./screens/settings.js";
import { entered, mode, setEntered, setMode } from "./lib/prefs.js";
import * as store from "./lib/store.js";
import { post } from "./lib/personal.js";

// The nav has exactly four screens (user decision). `period` is "month" (Jul/Aug/Sep/Q3) or null.
// The accountant report is reached from Tax ("Export for my accountant"), not from the nav.
// My data and Settings & privacy are utility links in the sidebar foot and always show Your data.
const SCREENS = [
  { key: "overview", label: "Overview", icon: "overview", module: overview, period: "month" },
  { key: "ledger", label: "Ledger", icon: "ledger", module: ledger, period: "month" },
  { key: "tax", label: "Tax", icon: "tax", module: tax, period: "quarter" },
  { key: "ask", label: "Ask Atlas", icon: "ask", module: ask, period: null },
  { key: "report", label: "Report", icon: "report", module: report, period: "quarter", nav: false, navAs: "tax" },
  { key: "welcome", label: "Welcome", module: welcome, period: null, nav: false, bare: true },
  { key: "mydata", label: "My data", icon: "upload", module: mydata, period: null, nav: false, yours: true },
  { key: "settings", label: "Settings & privacy", icon: "shield", module: settings, period: null, nav: false, yours: true },
];

const DEFAULTS = { c: "C01", month: "2026-09", quarter: "2026-Q3" };
const PERIODS = ["2026-07", "2026-08", "2026-09", "2026-Q3"];

// How each fictional creator is introduced in the UI (labels only — no money). The UI is
// English-only, so creators whose data name is Chinese get a romanised display name.
const PERSONA = {
  C01: { display: "Moon Spirit", meta: "New York · US tax home · single-member LLC" },
  C02: { display: "Xiao Lu" },
  C04: { display: "A You" },
  C07: { display: "Mo Bai" },
  C11: { display: "Lena Koch", meta: "Berlin · DE tax home" },
};

export function persona(c) {
  if (c.id === "you") return { display: "You", meta: "Your data", name: "You" };
  const p = PERSONA[c.id] ?? {};
  return { display: p.display ?? c.name, meta: p.meta ?? `${c.tax_country} tax home`, name: c.name };
}

// Your data: the months in the uploaded statements and the quarters they fall in (the last four).
function yourPeriods(data) {
  const months = data?.summary?.months ?? [];
  return { months, quarters: [...new Set(months.map(quarterOf))].slice(-4) };
}

function parse(yours, data) {
  const [screen, query = ""] = location.hash.slice(1).split("?");
  const q = new URLSearchParams(query);
  const def = SCREENS.find(s => s.key === screen) ?? SCREENS[0];
  let period = q.get("p");
  if (yours) {
    const { months, quarters } = yourPeriods(data);
    const latest = months.at(-1) ?? null;
    if (!period || !(months.includes(period) || quarters.includes(period))) {
      period = def.period === "quarter" ? (latest && quarterOf(latest)) : latest;
    }
  } else {
    period ??= def.period === "quarter" ? DEFAULTS.quarter : DEFAULTS.month;
  }
  return { screen: def, creator: q.get("c") ?? DEFAULTS.c, period, query: q };
}

export function href(screen, params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return `#${screen}${q.toString() ? "?" + q : ""}`;
}

function periodsOf(ctx) {
  if (!ctx.yours) return PERIODS;
  const { months, quarters } = yourPeriods(ctx.data);
  const q = ctx.period ? quarterOf(ctx.period) : quarters.at(-1);
  return [...months.filter(m => quarterOf(m) === q), ...quarters];
}

function periodFor(target, ctx) {
  // Keep the user's period when the target screen understands it.
  if (target.period === null) return null;
  return periodsOf(ctx).includes(ctx.period) ? ctx.period : null;
}

const periodName = p => p.includes("Q") ? `Q${p.slice(-1)} ${p.slice(0, 4)}` : monthShort(p);

export function periodSeg(ctx) {
  return `<div class="sa-seg">${periodsOf(ctx).map(p => `<a href="${href(ctx.screen.key, { c: ctx.yours ? null : ctx.creator, p })}" class="${p === ctx.period ? "on" : ""}">${periodName(p)}</a>`).join("")}</div>`;
}

const issueText = c => c.data_issues?.length
  ? `${c.data_issues.reduce((n, i) => n + i.count, 0)} record${c.data_issues.length === 1 && c.data_issues[0].count === 1 ? "" : "s"} need${c.data_issues.length === 1 && c.data_issues[0].count === 1 ? "s" : ""} a rate · ${monthShort(c.data_issues[0].month)}`
  : "";

export function whoPill(ctx) {
  if (ctx.yours) {
    return `<div class="sa-who"><div class="av">${icon("lock", "sm")}</div><div><b>You</b><span>Your data · ${ctx.data.persistent ? "kept in this browser" : "this tab only"}</span></div></div>`;
  }
  const me = ctx.creators.find(c => c.id === ctx.creator) ?? ctx.creators[0];
  const p = persona(me);
  const warn = me.data_issues?.length;
  return `<label class="sa-who picker" title="${warn ? esc(issueText(me)) : "Switch creator"}">
    <div class="av">${esc(p.display[0])}${warn ? `<i class="warn-dot" aria-label="Has data issues"></i>` : ""}</div>
    <div><b>${esc(p.display)}</b><span>${esc(warn ? issueText(me) : p.meta)}</span></div>
    ${icon("chevron", "sm chev")}
    <select data-creator-switch aria-label="Creator">${ctx.creators.map(c => `<option value="${c.id}" ${c.id === me.id ? "selected" : ""}>${esc(persona(c).display)}${c.data_issues?.length ? ` · ${esc(issueText(c))}` : ""}</option>`).join("")}</select>
  </label>`;
}

// Display currency switch (Your data only; the demo is in USD). Saving it re-renders the screen.
export function currencySeg(ctx) {
  if (!ctx.yours) return "";
  return `<div class="sa-seg cur" aria-label="Display currency">${[["USD", "$"], ["CNY", "¥"]].map(([c, g]) =>
    `<button type="button" data-currency="${c}" class="${c === ctx.cur ? "on" : ""}"><span>${g}</span>${c}</button>`).join("")}</div>`;
}

let renderSeq = 0;

async function go() {
  const seq = ++renderSeq;
  const [screenKey] = location.hash.slice(1).split("?");
  const target = SCREENS.find(s => s.key === screenKey);
  if (target?.yours && mode() !== "yours") setMode("yours");
  const yours = mode() === "yours" && !target?.bare;
  const data = yours ? await store.load() : null;
  const route = parse(yours, data);
  const main = document.getElementById("main");
  const creators = await get("creators");
  const ctx = {
    ...route, creators, me: creators.find(c => c.id === route.creator) ?? creators[0], href, periodSeg, whoPill, persona, currencySeg,
    yours, mode: yours ? "yours" : "demo", data, has: yours && store.hasData(data),
    cur: yours ? data.settings.currency : "USD",
    load: (path, params = {}) => yours ? post(path, params, data) : get(path, { creator: route.creator, ...params }),
    refresh: () => go(),
  };
  ctx.money = v => cur(v, ctx.cur);

  // The welcome screen stands alone: no sidebar.
  document.querySelector(".sa-app").classList.toggle("bare", !!ctx.screen.bare);
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
  main.querySelectorAll("[data-currency]").forEach(b => b.addEventListener("click", async () => {
    if (b.dataset.currency === ctx.cur) return;
    await store.saveSettings({ currency: b.dataset.currency });
    go();
  }));
}

function renderNav(ctx) {
  const current = ctx.screen.navAs ?? ctx.screen.key;
  const c = ctx.yours || ctx.creator === DEFAULTS.c ? null : ctx.creator;
  document.getElementById("nav").innerHTML = SCREENS.filter(s => s.nav !== false).map(s =>
    `<a href="${href(s.key, { c, p: periodFor(s, ctx) })}" class="${s.key === current ? "on" : ""}">${icon(s.icon)}<span>${s.label}</span></a>`).join("");
  const keep = SCREENS.find(s => s.key === current && s.nav !== false) ? current : "overview";
  document.getElementById("mode").innerHTML =
    `<a href="#${keep}" data-mode="yours" class="${ctx.yours ? "on" : ""}">${icon("lock", "sm")}Your data</a><a href="#${keep}" data-mode="demo" class="${ctx.yours ? "" : "on"}">Demo data</a>`;
  const files = ctx.yours ? ctx.data.files.filter(f => f.kind === "statement").length : 0;
  document.getElementById("util").innerHTML = SCREENS.filter(s => s.yours).map(s =>
    `<a href="#${s.key}" class="${s.key === current ? "on" : ""}">${icon(s.icon)}${esc(s.label)}${s.key === "mydata" && files ? `<span class="r">${files} file${files === 1 ? "" : "s"}</span>` : ""}</a>`).join("");
  document.getElementById("prism").innerHTML = `<i></i>${ctx.yours ? "Content-free PRISM traces" : "Every run traced in PRISM"}`;
}

document.getElementById("tagline").textContent = COPY.TAGLINE;
document.getElementById("signout").addEventListener("click", () => {
  setEntered(false);
  location.hash = "#welcome";
});
// The data switch: remember the choice, then open the same screen with the other ledger.
document.getElementById("mode").addEventListener("click", ev => {
  const a = ev.target.closest("[data-mode]");
  if (!a) return;
  ev.preventDefault();
  setMode(a.dataset.mode);
  const target = a.getAttribute("href");
  if (location.hash === target) go(); else location.hash = target;
});
// First visit to the bare URL opens the welcome screen; any deep link goes straight to its screen.
if (!location.hash && !entered()) history.replaceState(null, "", "#welcome");
document.getElementById("disclaimer").textContent = COPY.DISCLAIMER;
window.addEventListener("hashchange", go);
go();

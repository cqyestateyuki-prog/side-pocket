// Side Pocket front end: hash router + shared shell (nav, period and currency switches).
// Screens live in screens/*.js and register below; each exports render(ctx) -> Promise<html>
// and may export mount(ctx) to wire up events after the html is in the page.
// One account: Moon Spirit, whose statements, entries and settings are kept in this browser
// (lib/store.js, loaded the first time by lib/seed.js); every screen asks ctx.load(), which posts
// them to /api/personal/*.
import { cur, esc, icon, monthName, quarterOf } from "./lib/format.js";
import * as overview from "./screens/overview.js";
import * as ledger from "./screens/ledger.js";
import * as tax from "./screens/tax.js";
import * as ask from "./screens/ask.js";
import * as report from "./screens/report.js";
import * as welcome from "./screens/welcome.js";
import * as mydata from "./screens/mydata.js";
import * as settings from "./screens/settings.js";
import * as milestones from "./screens/milestones.js";
import { entered, setEntered } from "./lib/prefs.js";
import * as store from "./lib/store.js";
import { seedOnFirstVisit } from "./lib/seed.js";
import { bindDropdowns, dropdown } from "./lib/dropdown.js";
import { post } from "./lib/personal.js";

// The nav has exactly four screens (user decision). `period` is "month" or "quarter" or null.
// The accountant report is reached from Tax ("Export for my accountant"), not from the nav.
// Under a rule: My data, Milestones and Settings & privacy.
const SCREENS = [
  { key: "overview", label: "Overview", icon: "overview", module: overview, period: "month" },
  { key: "ledger", label: "Ledger", icon: "ledger", module: ledger, period: "month" },
  { key: "tax", label: "Tax", icon: "tax", module: tax, period: "quarter" },
  { key: "ask", label: "Ask Tilly", icon: "ask", module: ask, period: null },
  { key: "report", label: "Report", icon: "report", module: report, period: "quarter", nav: false, navAs: "tax" },
  { key: "welcome", label: "Welcome", module: welcome, period: null, nav: false, bare: true },
  { key: "mydata", label: "My data", icon: "upload", module: mydata, period: null, nav: false, util: true },
  { key: "milestones", label: "Milestones", icon: "award", module: milestones, period: null, nav: false, util: true },
  { key: "settings", label: "Settings & privacy", icon: "shield", module: settings, period: null, nav: false, util: true },
];

// The person using the app (fictional).
export const ME = { name: "Moon Spirit", initial: "M", meta: "New York · designer" };

// The months in the stored statements and the quarters they fall in (the last four).
function periods(data) {
  const months = data?.summary?.months ?? [];
  return { months, quarters: [...new Set(months.map(quarterOf))].slice(-4) };
}

function parse(data) {
  const [screen, query = ""] = location.hash.slice(1).split("?");
  const q = new URLSearchParams(query);
  const def = SCREENS.find(s => s.key === screen) ?? SCREENS[0];
  let period = q.get("p");
  const { months, quarters } = periods(data);
  const latest = months.at(-1) ?? null;
  if (!period || !(months.includes(period) || quarters.includes(period))) {
    period = def.period === "quarter" ? (latest && quarterOf(latest)) : latest;
  }
  return { screen: def, period, query: q };
}

export function href(screen, params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return `#${screen}${q.toString() ? "?" + q : ""}`;
}

function periodsOf(ctx) {
  const { months, quarters } = periods(ctx.data);
  return [...months, ...quarters];
}

function periodFor(target, ctx) {
  // Keep the user's period when the target screen understands it.
  if (target.period === null) return null;
  return periodsOf(ctx).includes(ctx.period) ? ctx.period : null;
}

const periodName = p => p.includes("Q") ? `Q${p.slice(-1)} ${p.slice(0, 4)}` : `${monthName(p)} ${p.slice(0, 4)}`;

// Period and display currency are dropdowns (kit v1.4.1), so the list can grow with more months,
// quarters and years: months newest first, then quarters.
export function periodSeg(ctx) {
  if (!ctx.period) return "";
  const all = periodsOf(ctx);
  const options = [...all.filter(p => !p.includes("Q")).reverse().map(p => ({ value: p, label: periodName(p), group: "Months" })),
                   ...all.filter(p => p.includes("Q")).reverse().map(p => ({ value: p, label: periodName(p), group: "Quarters" }))];
  return dropdown({ name: "period", label: "Period", value: ctx.period, options,
    trigger: `${icon("calendar", "sm")}<span>${periodName(ctx.period)}</span>` });
}

export function whoPill() {
  return `<div class="sa-who"><div class="av">${ME.initial}</div><div><b>${ME.name}</b><span>${ME.meta}</span></div></div>`;
}

// Display currency switch. Saving it re-renders the screen.
const CURRENCIES = [["USD", "$", "US dollar"], ["CNY", "¥", "Chinese yuan"]];
export function currencySeg(ctx) {
  const [, g] = CURRENCIES.find(([c]) => c === ctx.cur) ?? CURRENCIES[0];
  return dropdown({ name: "currency", label: "Display currency", value: ctx.cur,
    options: CURRENCIES.map(([c, sym, n]) => ({ value: c, label: c, meta: n, icon: `<b class="sym">${sym}</b>` })),
    trigger: `<b class="g">${g}</b><span>${ctx.cur}</span>` });
}

// "7 of 8" next to Milestones, once a screen has loaded the badges.
let badgeCount = null;

let renderSeq = 0;

async function go() {
  const seq = ++renderSeq;
  const [screenKey] = location.hash.slice(1).split("?");
  const bare = !!SCREENS.find(s => s.key === screenKey)?.bare;
  const data = bare ? await store.load() : await seedOnFirstVisit();
  const route = parse(data);
  const main = document.getElementById("main");
  const ctx = {
    ...route, href, periodSeg, whoPill, currencySeg, me: ME,
    data, has: store.hasData(data), cur: data.settings.currency,
    load: (path, params = {}) => post(path, params, data),
    latestMonth: periods(data).months.at(-1) ?? null,
    noteBadges: list => { badgeCount = [list.filter(b => b.earned).length, list.length]; },
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
    renderNav(ctx); // picks up the badge count the screen just loaded
  } catch (e) {
    if (seq !== renderSeq) return;
    main.innerHTML = `<div class="sa-card sa-error">${icon("alert")} <div><b>Couldn’t load this screen.</b><div class="meta">${esc(e.message)}</div></div></div>`;
  } finally {
    main.classList.remove("loading");
  }
  bindDropdowns(main, {
    period: p => { location.hash = href(ctx.screen.key, { p }); },
    currency: async c => { await store.saveSettings({ currency: c }); go(); },
  });
}

function renderNav(ctx) {
  const current = ctx.screen.navAs ?? ctx.screen.key;
  const files = ctx.data.files.filter(f => f.kind === "statement").length;
  // One menu: the four screens, then My data, Milestones and Settings & privacy under a thin rule.
  document.getElementById("nav").innerHTML = SCREENS.filter(s => s.nav !== false).map(s =>
    `<a href="${href(s.key, { p: periodFor(s, ctx) })}" class="${s.key === current ? "on" : ""}">${icon(s.icon)}<span>${s.label}</span></a>`).join("")
    + `<hr class="sa-navsep">` + SCREENS.filter(s => s.util).map(s => {
      const count = s.key === "mydata" && files ? `${files} file${files === 1 ? "" : "s"}`
        : s.key === "milestones" && badgeCount && ctx.has ? badgeCount.join(" of ") : "";
      return `<a href="#${s.key}" class="${s.key === current ? "on" : ""}">${icon(s.icon)}<span>${esc(s.label)}</span>${count ? `<span class="r">${count}</span>` : ""}</a>`;
    }).join("");
}

document.getElementById("signout").addEventListener("click", () => {
  setEntered(false);
  location.hash = "#welcome";
});
// First visit to the bare URL opens the welcome screen; any deep link goes straight to its screen.
if (!location.hash && !entered()) history.replaceState(null, "", "#welcome");
window.addEventListener("hashchange", go);
go();

import { COPY, YOURS } from "../lib/copy.js";
import { cur, dateLong, daysBetween, esc, icon, localDay, periodLabel, picon, usd } from "../lib/format.js";
import { COUNTRY, emptyScreen, flag, platformKey, th, top, warnCard } from "../lib/parts.js";
import { mascot } from "../lib/mascot.js";
import { saveExcluded, saveRate, setAside } from "../lib/prefs.js";
import { saveSettings } from "../lib/store.js";

const STATUS = {
  below: ["sim", "Below 1099-K threshold"],
  over_so_far: ["tax", "Form likely"],
  projected_over: ["tax", "Form likely by year end"],
  not_applicable: ["tax", "CN record"],
};

function formsTable(F) {
  const rows = [...F.platforms].sort((a, b) => b.bank_view_landed_usd - a.bank_view_landed_usd);
  return rows.map(f => {
    const items = f.gap_items_usd;
    const gap = f.gap_usd ?? (items.platform_fees + items.payout_fees + items.tax_withheld + items.refunds);
    const segs = [[items.platform_fees, "var(--sa-fee)"], [items.payout_fees, "var(--sa-payout)"], [items.tax_withheld, "var(--sa-tax)"], [items.refunds, "var(--sa-fx)"]];
    const [cls, text] = f.possible_duplicate_report ? ["warn", "Possible duplicate"] : (STATUS[f.calendar_year.status] ?? ["sim", f.calendar_year.status]);
    const form = f.form === "none" ? "No US form · CN withholding record" : `${f.form} (simulated)`;
    return `<tr>
      <td>${picon(f.platform)}<b>${esc(f.label)}</b></td>
      <td><span class="sa-badge sim" title="${esc(f.issuer)}">${esc(form)}</span></td>
      <td class="money">${f.form_view_gross_usd == null ? `<span class="meta">—</span>` : usd(f.form_view_gross_usd)}</td>
      <td class="money net">${usd(f.bank_view_landed_usd)}</td>
      <td>${f.form_view_gross_usd == null
        ? `<span class="meta">—</span>`  // no form to reconcile against, so there is no gap to show
        : `<div class="gapcell"><div class="sa-gap">${gap > 0 ? segs.map(([v, c]) => v > 0 ? `<span style="width:${Math.max(4, v / gap * 100)}%;background:${c}"></span>` : "").join("") : ""}</div>
        <span class="num ${gap > 0 ? "" : "meta"}">${gap > 0 ? usd(-gap) : "no gap"}</span></div>`}</td>
      <td class="money">${f.transactions}</td>
      <td><span class="sa-badge ${cls}" title="${esc(f.calendar_year.meaning ?? "")}">${cls === "warn" ? icon("duplicate", "sm") + " " : ""}${text}</span></td></tr>`;
  }).join("");
}

const PRESETS = [20, 25, 30];
let ed = null; // the open set-aside editor: { creator, rate (whole %), out: Set<platform>, totalNet, byPlatform, api, yours }
let fmt = usd;  // money in the display currency (Your data can show CNY)

function heroBase(sa, qLabel) {
  return `<div class="sub" data-sa-base><button class="rate-chip" data-rate-edit aria-expanded="false">${Math.round(sa.rate * 100)}% ${icon("sliders", "sm")}</button>
      of ${qLabel}net income (${fmt(sa.base)})${sa.excluded.size ? ", some platforms left out" : ""}</div>`;
}

function heroAmount(sa, qLabel) {
  return `<div class="sa-fig num" data-sa-amt>${fmt(sa.amount)}</div>${heroBase(sa, qLabel)}`;
}

function editor(sa, plats) {
  const r = Math.round(sa.rate * 100);
  return `<div class="sa-rateedit" data-editor hidden>
    <div class="row">
      <div class="sa-seg on-dark" data-presets>${PRESETS.map(x => `<button data-r="${x}" class="${x === r ? "on" : ""}">${x}%</button>`).join("")}</div>
      <input type="range" class="sa-range" data-rate min="0" max="50" step="1" value="${Math.min(50, r)}" aria-label="Set-aside rate">
      <label class="sa-rateinput"><input data-rate-in inputmode="decimal" value="${r}" aria-label="Custom set-aside rate">%</label>
    </div>
    <div class="row meta-row"><span>${COPY.SETTINGS_PROMISE}</span><button class="link" data-reset ${sa.custom ? "" : "hidden"}>Reset to ${Math.round(sa.defaultRate * 100)}%</button></div>
    <details class="advanced"${sa.excluded.size ? " open" : ""}><summary>Advanced · platforms in the base</summary>
      <ul class="sa-togglelist">${plats.map(p => `<li data-p="${p.platform}" class="${sa.excluded.has(p.platform) ? "off" : ""}"><span class="tl-name">${picon(p.platform)}${esc(p.label)}</span><span class="amt">${fmt(p.net)}</span><button class="sa-toggle ${sa.excluded.has(p.platform) ? "" : "on"}" aria-label="Include ${esc(p.label)}"></button></li>`).join("")}</ul>
    </details>
  </div>`;
}

const issueLine = i => `${i.platform} ${i.record?.ref ?? ""}: no ${i.currency} rate for ${i.date}. It stays out until the rate is added.`;

export async function render(ctx) {
  return (await page(ctx)) + `<p class="sa-pagenote">${COPY.DISCLAIMER}</p>`;
}

async function page(ctx) {
  fmt = ctx.money ?? usd;
  if (ctx.yours && !ctx.has) return emptyScreen(ctx, "Tax", YOURS.EMPTY_TAX);
  // Your data: the report carries the tax items, so one request covers the page.
  const [T, R] = ctx.yours
    ? await ctx.load("report", { period: ctx.period }).then(r => [r.tax, r])
    : await Promise.all([ctx.load("tax-items", { period: ctx.period }), ctx.load("report", { period: ctx.period })]);
  const home = ctx.yours ? (ctx.query.get("view") ?? ctx.data.settings.tax_home) : null;
  if (home === "CN" || home === "cn") return china(ctx, T, R);
  if (home === "BOTH") return both(ctx, T, R);
  const k = ctx.yours ? ctx.cur.toLowerCase() : "usd";
  const country = ctx.yours ? "US" : ctx.me.tax_country;
  const F = T.forms;
  const due = T.next_us_estimated_tax_due;
  const label = periodLabel(ctx.period);
  const issues = [...T.issues, ...(F.issues ?? []).filter(i => !T.issues.some(j => j.record?.ref === i.record?.ref))];
  const dups = F.platforms.filter(p => p.possible_duplicate_report);
  const withheld = T.tax_withheld_by_platform;
  const noneNote = T.items_for_accountant.find(x => x.startsWith("No tax was withheld"));
  // Your data lists the US items as the API words them for the tax home; the demo keeps its list.
  const items = ctx.yours ? (T.by_country.find(c => c.country === "US")?.items ?? []).map(x => x.text).filter(x => !x.startsWith("No tax was withheld"))
    : T.items_for_accountant.filter(x => x !== noneNote);
  const accountant = [
    ...items,
    ...dups.map(p => `${p.label} pays out through ${p.payout_method}: the same money may appear on two 1099-Ks.`),
    ...issues.map(issueLine),
  ];
  const T4 = F.totals_for_platforms_with_forms;
  const plats = [...R.by_platform].sort((a, b) => b.net - a.net);
  const totalNet = T[`total_net_${k}`];
  const who = ctx.yours ? "yours" : ctx.creator;
  const sa = setAside(who, { totalNet, byPlatform: plats, api: T.set_aside, rate: ctx.yours ? ctx.data.settings.set_aside_rate : null });
  const qLabel = ctx.period.includes("Q") ? `Q${ctx.period.slice(-1)} ` : "";
  ed = { creator: who, rate: Math.round(sa.rate * 100), out: new Set(sa.excluded), totalNet, byPlatform: plats, api: T.set_aside, qLabel, yours: ctx.yours };

  return top(ctx, "Tax", "") + `
  <div class="sa-grid">
    ${warnCard(ctx, issues)}
    <section class="sa-hero c8 tax-hero">
      <div class="orb"></div>
      ${mascot("piggy-bank", "hero-mascot")}
      <div>
        <div class="title">${COPY.TAX_HERO}</div>
        ${country === "US" ? "" : `<div class="sub" style="margin-top:8px">${icon("globe", "sm")} ${COUNTRY[country] ?? country} tax home: US estimated-tax dates don’t apply.</div>`}
        <div class="amount">
          ${heroAmount(sa, qLabel)}
        </div>
        ${editor(sa, plats)}
        ${due?.due_date && country === "US" ? `<div class="tax-counts">${count(due.days_left, "days until payment", `${dateLong(due.due_date)} · ${usQuarter(due.due_date)}`)}</div>` : ""}
      </div>
    </section>
    <section class="sa-card c4">
      <div class="head"><h2>Tax withheld</h2></div>
      ${withheld.length ? withheld.map(w => `<div class="withheld">
        ${withheldWho(w.country, w.platform)}
        <div class="amt"><div class="sa-fig num">${fmt(w[`withheld_${k}`])}</div>${w.withheld_cny != null && k !== "cny" ? `<div class="meta num">${cur(w.withheld_cny, "CNY")}</div>` : ""}</div>
      </div>`).join("") : `<div class="meta">No platform withheld tax in ${label.split(" · ")[0]}.</div>`}
      ${noneNote ? `<div class="sa-note info" style="margin-top:16px">${icon("info", "sm")}<span>${esc(noneNote.replace(/^No tax was withheld on income from (.*?); the set-aside covers it\.?$/, "The set-aside includes $1 income, which had no tax withheld."))}</span></div>` : ""}
    </section>
    <section class="sa-card c12">
      <div class="head"><h2>${COPY.FORMS_HEADLINE}</h2><span class="sa-ribbon">${icon("info", "sm")} Simulated forms · real 1099-K threshold</span></div>
      <div class="sa-tablewrap"><table class="sa-table">
        <thead><tr>${th("layers", "Platform")}${th("file", "Form")}${th("report", "Form view", "money")}${th("bank", "Bank view", "money")}${th("duplicate", COPY.GAP_LABEL)}${th("ledger", "Records", "money")}${th("check", "Status")}</tr></thead>
        <tbody>${formsTable(F)}
          <tr class="total"><td colspan="2">Platforms with forms</td><td class="money">${usd(T4.form_view_gross_usd)}</td><td class="money">${usd(T4.bank_view_landed_usd)}</td><td class="num">${usd(-T4.gap_usd)}</td><td></td><td></td></tr>
        </tbody></table></div>
      <div class="sa-grid notes">
        <div class="sa-note info ${dups.length ? "c6" : "c12"}">${icon("info", "sm")}<span>${COPY.THRESHOLD_NOTE}</span></div>
        ${dups.length ? `<div class="sa-note warn c6">${icon("duplicate", "sm")}<span>${COPY.DUPLICATE_NOTE} <b>${dups.map(d => esc(d.label)).join(", ")}</b> pays out to ${esc(dups[0].payout_method)}.</span></div>` : ""}
      </div>
    </section>
    <section class="sa-card c12 accountant">
      <div><div class="head"><h2>Accountant checklist</h2></div>
        <ul class="sa-check" data-checklist>${accountant.map(x => `<li><button class="box" aria-label="Mark done"></button><span>${esc(x)}</span></li>`).join("")}</ul></div>
      <a class="sa-btn primary" href="${ctx.href("report", { c: ctx.yours ? null : ctx.creator, p: ctx.period })}">${icon("download", "sm")} Export for my accountant</a>
    </section>
  </div>`;
}

// ---------------------------------------------------------------- Your data: China and Both (kit 13, 15)

const INSIDE_CHINA = new Set(["bilibili"]);
const monthDay = d => new Date(d + "T12:00:00").toLocaleString("en-US", { month: "long", day: "numeric" });
const shortDate = d => new Date(d + "T12:00:00").toLocaleString("en-US", { month: "short", day: "numeric" });
const today = () => localDay();

// The countdown to China's annual filing window: days until it opens, or days left while it is open.
function cnWindow(T) {
  const cn = T.by_country.find(c => c.country === "CN");
  const w = cn?.deadlines.find(d => d.id === "cn_annual_reconciliation");
  if (!w) return null;
  const now = T.next_us_estimated_tax_due?.after ?? today();
  const open = daysBetween(now, w.opens) <= 0;
  const taxYear = String(+w.opens.slice(0, 4) - 1);
  return { ...w, taxYear, open, days: open ? daysBetween(now, w.closes) : daysBetween(now, w.opens),
           span: `${shortDate(w.opens)} to ${shortDate(w.closes)}, ${w.closes.slice(0, 4)}`,
           of: open ? "days left to file" : "days until filing opens",
           ofBoth: open ? "days left to file in China" : "days until China filing" };
}

// Who withheld: the country's flag and name, the platform underneath.
const withheldWho = (country, platform) => `<div class="who">${flag(country)}<div><b>${COUNTRY[country] ?? esc(country)}</b>
  <span class="by">${picon(platformKey(platform))}${esc(platform)}</span></div></div>`;

// One countdown: the big number, a short label, and the date in a glass pill.
function count(days, of, when) {
  return `<div class="tax-count"><div class="days num">${days}</div><div><div class="of">${of}</div><div class="glass">${icon("calendar", "sm")} ${when}</div></div></div>`;
}

// Platforms split by where they pay out from, with the Chinese tax each withheld.
function cnSplit(ctx, T, R) {
  const k = ctx.cur.toLowerCase();
  const cnTax = Object.fromEntries(T.tax_withheld_by_platform.filter(w => w.country === "CN").map(w => [platformKey(w.platform), w[`withheld_${k}`]]));
  const plats = [...R.by_platform].sort((a, b) => b.net - a.net).map(p => ({ ...p, cn_tax: cnTax[p.platform] ?? 0 }));
  const sum = (list, f) => Math.round(list.reduce((n, p) => n + p[f], 0) * 100) / 100;
  const inside = plats.filter(p => INSIDE_CHINA.has(p.platform)), outside = plats.filter(p => !INSIDE_CHINA.has(p.platform));
  return { inside, outside, sum, cnTax, withheldCn: T.tax_withheld_by_platform.filter(w => w.country === "CN") };
}

const periodWord = period => period.includes("Q") ? `Q${period.slice(-1)}` : periodLabel(period);

function accountantCard(ctx, items) {
  return `<section class="sa-card c12 accountant">
      <div><div class="head"><h2>Accountant checklist</h2></div>
        <ul class="sa-check" data-checklist>${items.map(x => `<li><button class="box" aria-label="Mark done"></button><span>${x}</span></li>`).join("")}</ul>
        ${ctx.data.settings.tax_home === "CN" ? `<div class="meta" style="margin-top:10px;display:flex;gap:6px;align-items:center">${icon("info", "sm")} ${YOURS.US_HIDDEN}</div>` : ""}</div>
      <a class="sa-btn primary" href="${ctx.href("report", { p: ctx.period })}">${icon("download", "sm")} Export for my accountant</a>
    </section>`;
}

function china(ctx, T, R) {
  const k = ctx.cur.toLowerCase(), money = ctx.money;
  const label = periodLabel(ctx.period), word = periodWord(ctx.period);
  const qLabel = ctx.period.includes("Q") ? `Q${ctx.period.slice(-1)} ` : "";
  const win = cnWindow(T);
  const { inside, outside, sum, withheldCn } = cnSplit(ctx, T, R);
  const row = p => `<tr><td>${picon(p.platform)}<b>${esc(p.label)}</b></td><td class="money">${p.records}</td>
    <td class="money">${money(p.gross)}</td><td class="money net">${money(p.net)}</td><td class="money ${p.cn_tax ? "tax" : "zero"}">${money(p.cn_tax)}</td></tr>`;
  const all = [...inside, ...outside];
  const cnTotal = sum(all, "cn_tax");
  const items = [
    ...(cnTotal ? [YOURS.ACC_WITHHELD.replace("{amount}", `<b class="num">${money(cnTotal)}</b>`).replace("in Q3", `in ${word}`).replace("Bilibili", esc(withheldCn.map(w => w.platform).join(" and ")))] : []),
    ...(outside.length ? [YOURS.ACC_OUTSIDE.replace("{n} platforms", outside.length === 1 ? "1 platform" : `${outside.length} platforms`).replace("{gross}", `<b class="num">${money(sum(outside, "gross"))}</b>`).replace("{net}", `<b class="num">${money(sum(outside, "net"))}</b>`).replace("in Q3", `in ${word}`)] : []),
    ...(win ? [YOURS.ACC_WINDOW.replace("2026", win.taxYear).replace("March 1 to June 30, 2027", `${monthDay(win.opens)} to ${monthDay(win.closes)}, ${win.closes.slice(0, 4)}`)] : []),
    ...(ctx.cur === "CNY" && R.fx_used.length ? [YOURS.ACC_FX.replace("{n}", R.fx_used.length)] : []),
    ...T.issues.map(i => esc(issueLine(i))),
  ];
  return top(ctx, "Tax", "") + `
  <div class="sa-grid">
    ${warnCard(ctx, T.issues)}
    <section class="sa-hero c8 tax-hero cn">
      <div class="orb"></div>
      ${mascot("piggy-bank", "hero-mascot")}
      <div>
        <div class="title">${YOURS.CN_TAX_HERO}</div>
        <div class="amount"><div class="sa-fig num">${money(T.set_aside.amount)}</div>
          <div class="sub">${Math.round(T.set_aside.rate * 100)}% of ${qLabel}net income (${money(T[`total_net_${k}`])})</div></div>
        ${win ? `<div class="tax-counts">${count(win.days, win.of, win.span)}</div>` : ""}
      </div>
    </section>
    <section class="sa-card c4">
      <div class="head"><h2>Tax withheld</h2></div>
      ${withheldCn.length ? withheldCn.map(w => `<div class="withheld">
        ${withheldWho("CN", w.platform)}
        <div class="amt"><div class="sa-fig num">${money(w[`withheld_${k}`])}</div>${w.withheld_cny != null && k !== "cny" ? `<div class="meta num">${cur(w.withheld_cny, "CNY")}</div>` : ""}</div>
      </div>`).join("") + `<div class="sa-note info" style="margin-top:16px">${icon("info", "sm")}<span>${YOURS.CN_WITHHELD_NOTE}</span></div>`
      : `<div class="meta">No platform withheld Chinese tax in ${label.split(" · ")[0]}.</div>`}
    </section>
    <section class="sa-card c12">
      <div class="head"><h2>Income by payment location</h2>${win ? `<span class="meta">${YOURS.CN_WINDOW_LABEL.replace("2026", win.taxYear).replace("March 1 to June 30, 2027", `${monthDay(win.opens)} to ${monthDay(win.closes)}, ${win.closes.slice(0, 4)}`)}</span>` : ""}</div>
      ${outside.length ? `<div class="sa-note warn" style="margin-bottom:14px">${icon("globe", "sm")}<span>${YOURS.CN_FOREIGN_FLAG}</span></div>` : ""}
      <div class="sa-tablewrap"><table class="sa-table">
        <thead><tr>${th("layers", "Platform")}${th("ledger", "Records", "money")}${th("coins", "Gross", "money")}${th("wallet", "Net", "money")}${th("bank", "Chinese tax withheld", "money")}</tr></thead>
        <tbody>
          ${inside.length ? `<tr class="group"><td colspan="5">Inside China <span class="sa-badge tax">Withheld at withdrawal</span></td></tr>${inside.map(row).join("")}` : ""}
          ${outside.length ? `<tr class="group"><td colspan="5">Outside China · ${outside.length} platform${outside.length === 1 ? "" : "s"} <span class="sa-badge warn">No Chinese tax withheld</span></td></tr>${outside.map(row).join("")}` : ""}
          <tr class="total"><td>${esc(word)} total</td><td class="money">${sum(all, "records")}</td><td class="money">${money(sum(all, "gross"))}</td><td class="money">${money(sum(all, "net"))}</td><td class="money">${money(cnTotal)}</td></tr>
        </tbody></table></div>
    </section>
    ${accountantCard(ctx, items)}
  </div>`;
}

// US estimated tax is due Apr 15, Jun 15, Sep 15 and Jan 15 (next year) for Q1 to Q4.
const usQuarter = d => ({ 1: "Q4", 4: "Q1", 6: "Q2", 9: "Q3" })[+d.slice(5, 7)] ?? "";

function both(ctx, T, R) {
  const k = ctx.cur.toLowerCase(), money = ctx.money;
  const qLabel = ctx.period.includes("Q") ? `Q${ctx.period.slice(-1)} ` : "";
  const due = T.next_us_estimated_tax_due, win = cnWindow(T);
  const F = T.forms, T4 = F?.totals_for_platforms_with_forms;
  const dup = F?.platforms?.find(p => p.possible_duplicate_report);
  const { inside, outside, sum, withheldCn } = cnSplit(ctx, T, R);
  const bili = inside[0];
  const rate = Math.round(T.set_aside.rate * 100);
  const items = [
    ...T.by_country.flatMap(c => c.items.map(x => esc(x.text))),
    ...(dup ? [esc(`${dup.label} pays out through ${dup.payout_method}: the same money may appear on two 1099-Ks.`)] : []),
    ...T.issues.map(i => esc(issueLine(i))),
  ];
  const usCount = due?.due_date ? count(due.days_left, "days until US payment", `${dateLong(due.due_date)} · ${usQuarter(due.due_date)}`) : "";
  return top(ctx, "Tax", "") + `
  <div class="sa-grid">
    ${warnCard(ctx, T.issues)}
    <section class="sa-hero c12 tax-hero both">
      <div class="orb"></div>
      ${mascot("piggy-bank", "hero-mascot")}
      <div>
        <div class="title">${YOURS.BOTH_HERO}</div>
        <div class="amount"><div class="sa-fig num">${money(T.set_aside.amount)}</div>
          <div class="sub">${rate}% of ${qLabel}net income (${money(T[`total_net_${k}`])})</div></div>
        <div class="tax-counts">${usCount}${win ? count(win.days, win.ofBoth, win.span) : ""}</div>
      </div>
    </section>
    <div class="c12 sa-note info">${icon("globe", "sm")}<span>${YOURS.BOTH_FLAG}</span></div>
    <section class="sa-card c12">
      <div class="sa-section-head"><span class="sa-badge sim">${icon("bank", "sm")} United States</span><h2>Estimated tax and forms</h2><a class="sa-btn secondary sm" href="${ctx.href("tax", { p: ctx.period, view: "us" })}">Open the forms check</a></div>
      <div class="sa-facts">
        <div><div class="label">Next payment</div><b>${due?.due_date ? dateLong(due.due_date) : "—"}</b><span class="s">${due?.due_date ? `for ${usQuarter(due.due_date)} · ${due.days_left} days` : ""}</span></div>
        <div><div class="label">Set aside (${rate}%)</div><b class="num">${money(T.set_aside.amount)}</b><span class="s">of ${money(T[`total_net_${k}`])} ${qLabel}net</span></div>
        <div><div class="label">Forms vs deposits</div><b class="num">${T4 ? usd(T4.form_view_gross_usd) : "—"}</b><span class="s">${T4 ? `${usd(T4.bank_view_landed_usd)} landed · gap ${usd(T4.gap_usd)}` : ""}</span></div>
        <div><div class="label">Possible duplicate</div><b>${dup ? esc(dup.label) : "None found"}</b><span class="s">${dup ? `paid out to ${esc(dup.payout_method)}: check both forms` : "for platforms with forms"}</span></div>
      </div>
    </section>
    <section class="sa-card c12">
      <div class="sa-section-head"><span class="sa-badge tax">${icon("globe", "sm")} China</span><h2>Withholding and annual filing</h2><a class="sa-btn secondary sm" href="${ctx.href("tax", { p: ctx.period, view: "cn" })}">Open China details</a></div>
      <div class="sa-facts">
        <div><div class="label">Withheld by ${withheldCn.length ? esc(withheldCn.map(w => w.platform).join(" and ")) : "Chinese platforms"}</div><b class="num tax">${money(sum(inside, "cn_tax"))}</b><span class="s">${withheldCn[0]?.withheld_cny != null && k !== "cny" ? `${cur(withheldCn[0].withheld_cny, "CNY")} · ` : ""}individual income tax</span></div>
        <div><div class="label">${bili ? `${esc(bili.label)} income` : "Income inside China"}</div><b class="num">${money(sum(inside, "gross"))}</b><span class="s">gross${bili?.native_cny && k !== "cny" ? ` · ${cur(bili.native_cny.gross, "CNY")}` : ""}</span></div>
        <div><div class="label">Income outside China</div><b class="num">${money(sum(outside, "gross"))}</b><span class="s">gross from ${outside.length} platform${outside.length === 1 ? "" : "s"} · no Chinese tax withheld</span></div>
        <div><div class="label">Annual filing window</div><b>${win ? `${shortDate(win.opens)} to ${shortDate(win.closes)}` : "—"}</b><span class="s">${win ? `${win.closes.slice(0, 4)} · for tax year ${win.taxYear}` : ""}</span></div>
      </div>
    </section>
    ${accountantCard(ctx, items)}
  </div>`;
}

// Live recompute of the hero while the rate or the included platforms change; saved per browser.
function update(root) {
  // Your data keeps the rate in its settings (the API takes 0 to 60%); the demo keeps one per creator.
  ed.rate = Math.max(0, Math.min(ed.yours ? 60 : 100, Math.round(ed.rate)));
  if (ed.yours) saveSettings({ set_aside_rate: ed.rate / 100 });
  else saveRate(ed.creator, ed.rate === Math.round(ed.api.rate * 100) ? null : ed.rate / 100);
  saveExcluded(ed.creator, ed.out);
  const sa = setAside(ed.creator, { totalNet: ed.totalNet, byPlatform: ed.byPlatform, api: ed.api, rate: ed.yours ? ed.rate / 100 : null });
  const amt = root.querySelector(".tax-hero .amount");
  amt.querySelector("[data-sa-amt]").textContent = fmt(sa.amount);
  amt.querySelector("[data-sa-base]").outerHTML = heroBase(sa, ed.qLabel);
  bindChip(root);
  root.querySelector("[data-rate-edit]").setAttribute("aria-expanded", "true");
  root.querySelector("[data-rate]").value = Math.min(50, ed.rate);
  root.querySelector("[data-rate-in]").value = ed.rate;
  root.querySelectorAll("[data-presets] button").forEach(b => b.classList.toggle("on", +b.dataset.r === ed.rate));
  root.querySelector("[data-reset]").hidden = !sa.custom;
}

function bindChip(root) {
  root.querySelector("[data-rate-edit]")?.addEventListener("click", () => {
    const box = root.querySelector("[data-editor]");
    box.hidden = !box.hidden;
    root.querySelector("[data-rate-edit]").setAttribute("aria-expanded", String(!box.hidden));
  });
}

export function mount(ctx, root) {
  root.querySelector("[data-checklist]")?.addEventListener("click", ev => {
    const box = ev.target.closest(".box");
    if (box) box.classList.toggle("done");
  });
  bindChip(root);
  const set = v => { ed.rate = Number(v) || 0; update(root); };
  root.querySelector("[data-rate]")?.addEventListener("input", e => set(e.target.value));
  root.querySelector("[data-rate-in]")?.addEventListener("change", e => set(e.target.value));
  root.querySelectorAll("[data-presets] button").forEach(b => b.addEventListener("click", () => set(b.dataset.r)));
  root.querySelector("[data-reset]")?.addEventListener("click", () => { ed.out.clear(); root.querySelectorAll(".sa-togglelist li").forEach(li => { li.classList.remove("off"); li.querySelector(".sa-toggle").classList.add("on"); }); set(Math.round(ed.api.rate * 100)); });
  root.querySelectorAll(".sa-togglelist .sa-toggle").forEach(t => t.addEventListener("click", () => {
    const li = t.closest("li");
    t.classList.toggle("on");
    li.classList.toggle("off");
    ed.out[t.classList.contains("on") ? "delete" : "add"](li.dataset.p);
    update(root);
  }));
  if (ctx.query.get("edit")) root.querySelector("[data-rate-edit]")?.click();
}

export { platformKey };

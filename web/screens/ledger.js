import { YOURS } from "../lib/copy.js";
import { cur, dateShort, esc, icon, mmdd, pcol, periodLabel, usd, weekday } from "../lib/format.js";
import { emptyScreen, noRateText, top, warnCard } from "../lib/parts.js";
import { openPanel } from "../lib/importPanel.js";

async function load(ctx) {
  if (ctx.period.includes("Q")) {
    const r = await ctx.load("report", { period: ctx.period });
    const books = await Promise.all(r.months.map(m => ctx.load("ledger", { month: m })));
    return { rows: books.flatMap(b => b.rows), totals: r.totals, platforms: r.by_platform, issues: r.issues };
  }
  const [l, o] = await Promise.all([
    ctx.load("ledger", { month: ctx.period }),
    ctx.load("overview", { month: ctx.period }),
  ]);
  return { rows: l.rows, totals: l.totals, platforms: o.platforms, issues: l.issues };
}

function filtered(ctx, rows) {
  const f = ctx.query.get("f"), t = ctx.query.get("t");
  return rows.filter(r => (!f || r.platform === f) && (!t || r.type === t))
    .sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform));
}

function original(r) {
  if (r.original.currency === "USD") return `<span class="meta">USD</span>`;
  const amt = cur(r.original.gross, r.original.currency);
  if (r.fx?.rate) return `${amt}<span class="fx">${r.fx.currency === "CNY" ? "÷" : "×"} ${r.fx.rate.toFixed(4)} · ${r.fx.rate_date}</span>`;
  return `${amt}<span class="fx missing">no rate for ${r.date}</span>`;
}

const cell = (v, cls) => v == null ? `<td class="money"><span class="sa-badge warn">rate missing</span></td>`
  : `<td class="money ${v === 0 ? "zero" : cls}">${v === 0 ? "—" : usd(cls === "net" ? v : -v)}</td>`;

export async function render(ctx) {
  if (ctx.yours) return ctx.has ? renderYours(ctx) : emptyScreen(ctx, "Ledger", YOURS.EMPTY_LEDGER);
  const L = await load(ctx);
  const t = L.totals;
  const rows = filtered(ctx, L.rows);
  const f = ctx.query.get("f"), type = ctx.query.get("t");
  const types = [...new Set(L.rows.filter(r => !f || r.platform === f).map(r => r.type))].sort();
  const link = extra => ctx.href("ledger", { c: ctx.creator, p: ctx.period, f, t: type, ...extra });
  // One home for the totals: the KPI row follows the platform filter (no repeated total row).
  const k = (f && L.platforms.find(p => p.platform === f)) || t;

  const importBtn = `<button class="sa-btn primary sm" data-import-open>${icon("upload", "sm")} Import statements</button>`;
  return top(ctx, "Ledger", periodLabel(ctx.period), { actions: importBtn }) + `
  ${L.issues.length ? `<div class="sa-grid" style="margin-bottom:20px">${warnCard(ctx, L.issues)}</div>` : ""}
  <div class="sa-kpirow">
    ${[["Gross", k.gross, ""], ["Platform fees", -k.platform_fee, "var(--sa-fee-text)"], ["Payout fees", -k.payout_fee, "var(--sa-payout-text)"],
       ["Tax withheld", -k.withheld, "var(--sa-tax-text)"], ["Net", k.net, "var(--sa-net-text)"]]
      .map(([l, v, c]) => `<div class="sa-card sa-kpi"><div class="label">${l}</div><div class="sa-fig num" style="${c ? `color:${c}` : ""}">${usd(v)}</div></div>`).join("")}
  </div>
  ${filters(ctx, L, link, types)}
  <div class="sa-tablewrap"><table class="sa-table dense">
    <thead><tr><th>Date</th><th>Platform</th><th>Type</th><th>Original</th><th class="money">Gross</th><th class="money">Platform fee</th><th class="money">Payout fee</th><th class="money">Withheld</th><th class="money">Net</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.net_usd == null ? "missing" : ""}">
      <td class="num">${mmdd(r.date)}</td>
      <td><i class="sa-pdot" style="background:${pcol(r.platform).fill}"></i>${esc(r.platform_label)}</td>
      <td>${esc(r.type)}${r.ref ? `<span class="sub">${esc(r.ref)}</span>` : ""}</td>
      <td class="num">${original(r)}</td>
      ${r.gross_usd == null ? cell(null) : `<td class="money">${usd(r.gross_usd)}</td>`}${cell(r.platform_fee_usd, "fee")}${cell(r.payout_fee_usd, "payout")}${cell(r.withheld_usd, "tax")}${cell(r.net_usd, "net")}</tr>`).join("")}
    </tbody></table></div>`;
}

function filters(ctx, L, link, types) {
  const f = ctx.query.get("f"), type = ctx.query.get("t");
  return `<div class="sa-filters">
    <a class="sa-chip ${f ? "" : "on"}" href="${link({ f: null, t: null })}">All · ${L.rows.length} records</a>
    ${L.platforms.map(p => `<a class="sa-chip ${f === p.platform ? "on" : ""}" href="${link({ f: f === p.platform ? null : p.platform, t: null })}"><i class="dot" style="background:${pcol(p.platform).fill}"></i>${p.label}</a>`).join("")}
    <label class="sa-btn secondary sm select">${icon("filter", "sm")} ${type ? esc(type) : "Type"}
      <select data-type aria-label="Record type"><option value="">All types</option>${types.map(x => `<option ${x === type ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
    <button class="sa-btn secondary sm" data-csv>${icon("download", "sm")} CSV</button>
  </div>`;
}

// ---------------------------------------------------------------- Your data (kit 17)

// One conversion under an amount: rate · date · source. The ECB publishes nothing on weekends and
// holidays, so a record from such a day names the working day whose rate it used.
function rateLine(fx, date) {
  if (!fx?.rate) return "";
  const op = /\/\s*rate/.test(fx.rule ?? "") ? "÷" : "×";
  const ecb = /ECB/.test(fx.source ?? "");
  const src = !ecb ? `${dateShort(fx.rate_date)} · <span class="src">Your rate file</span>`
    : fx.rate_date === date ? `${dateShort(fx.rate_date)} · <span class="src">ECB reference rate</span>`
    : `<span class="src">ECB rate of ${weekday(fx.rate_date)} ${dateShort(fx.rate_date)}</span>`;
  return `<span class="rate">${op} ${fx.rate.toFixed(4)} · ${src}</span>`;
}

const conversions = r => [r.fx, r.fx_cny].filter(x => x?.rate);
const issueFor = (L, r) => L.issues.find(i => i.date === r.date && i.platform === r.platform_label && (i.record?.ref ?? null) === (r.ref ?? null))
  ?? L.issues.find(i => i.date === r.date && i.platform === r.platform_label);

async function renderYours(ctx) {
  const money = ctx.money, k = ctx.cur.toLowerCase();
  const L = await load(ctx);
  const rows = filtered(ctx, L.rows);
  const f = ctx.query.get("f"), type = ctx.query.get("t");
  const types = [...new Set(L.rows.filter(r => !f || r.platform === f).map(r => r.type))].sort();
  const link = extra => ctx.href("ledger", { p: ctx.period, f, t: type, ...extra });
  const t = (f && L.platforms.find(p => p.platform === f)) || L.totals;
  const left = rows.filter(r => r.issue).length;

  // Where the rates for converted records came from: the person's rate file (used exactly; a day it
  // lacks stops the record) or, for a currency without one, ECB reference rates.
  const converted = L.rows.filter(r => r.issue || conversions(r).length);
  const curs = [...new Set(converted.map(r => r.original.currency))];
  const ofSource = src => converted.filter(r => !r.issue && conversions(r).some(x => src.test(x.source ?? "")));
  const fromFile = ofSource(/rate file/).length, missing = converted.filter(r => r.issue).length;
  const ecb = ofSource(/ECB/), earlier = ecb.filter(r => conversions(r).some(x => /ECB/.test(x.source ?? "") && x.rate_date !== r.date)).length;
  const withFile = fromFile > 0 || L.issues.some(i => i.reason === "not_in_rate_file") || ctx.data.files.some(f => f.kind === "rates");
  const sources = [
    ...(withFile ? [`Your rate file <b class="num ink">${fromFile}</b> · missing <b class="num warn">${missing}</b>`] : []),
    ...(ecb.length || !withFile ? [`ECB reference rates <b class="num ink">${ecb.length}</b> · ${earlier} from an earlier working day`] : []),
  ];
  const ratesCard = `<div class="sa-card sa-kpi"><div class="label">${icon("fx", "sm")} ${curs.length ? `Rates for ${curs.join(" & ")} records` : "Exchange rates"}</div>
    <div class="meta" style="margin-top:10px;line-height:1.6">${curs.length ? sources.join("<br>") : `Every record is in ${ctx.cur}`}</div></div>`;

  const neg = (v, cls) => !v ? `<td class="money zero">—</td>` : `<td class="money ${cls}">${money(-v)}</td>`;
  const orig = r => `${cur(r.original.gross, r.original.currency)}<span class="sub">${esc(r.original.currency)}</span>`;
  const body = rows.map(r => {
    const head = `<td class="num">${mmdd(r.date)}</td><td><i class="sa-pdot" style="background:${pcol(r.platform).fill}"></i>${esc(r.platform_label)}</td>
      <td>${esc(r.type)}${r.ref ? `<span class="sub">${esc(r.ref)}</span>` : ""}</td><td class="num">${orig(r)}</td>`;
    if (r.issue) {
      const i = issueFor(L, r);
      return `<tr class="missing">${head}<td class="money"><span class="sa-badge warn">rate missing</span>${i ? `<span class="rate miss">${esc(noRateText(i))}</span>` : ""}</td><td colspan="3" class="money meta">left out of totals</td></tr>`;
    }
    return `<tr>${head}<td class="money">${money(r[`gross_${k}`])}${conversions(r).map(x => rateLine(x, r.date)).join("")}</td>
      ${neg(r[`platform_fee_${k}`] + r[`payout_fee_${k}`], "fee")}${neg(r[`withheld_${k}`], "tax")}<td class="money net">${money(r[`net_${k}`])}</td></tr>`;
  }).join("");
  const label = periodLabel(ctx.period).split(" · ")[0];

  const sub = `${label} · shown in ${ctx.cur}${curs.length ? (withFile ? " · with your rate file" : " · no rate file uploaded") : ""}`;
  return top(ctx, "Ledger", sub, { actions: ctx.currencySeg(ctx) }) + `
  ${L.issues.length ? `<div class="sa-grid" style="margin-bottom:16px">${warnCard(ctx, L.issues)}</div>` : ""}
  <div class="sa-kpirow">
    ${[["Gross", t.gross, ""], ["Fees", -(t.platform_fee + t.payout_fee), "var(--sa-fee-text)"], ["Tax withheld", -t.withheld, "var(--sa-tax-text)"],
       [L.issues.length ? "Net · incomplete" : "Net", t.net, "var(--sa-net-text)"]]
      .map(([l, v, c]) => `<div class="sa-card sa-kpi"><div class="label">${l}</div><div class="sa-fig num" style="${c ? `color:${c}` : ""}">${money(v)}</div></div>`).join("")}
    ${ratesCard}
  </div>
  ${curs.length ? `<div class="sa-note info" style="margin-bottom:14px">${icon("info", "sm")}<span>${withFile ? YOURS.LEDGER_FILE_NOTE : YOURS.LEDGER_ECB_NOTE}</span></div>` : ""}
  ${filters(ctx, L, link, types)}
  <div class="sa-tablewrap"><table class="sa-table dense">
    <thead><tr><th>Date</th><th>Platform</th><th>Type</th><th>Original</th><th class="money">Gross (${ctx.cur})</th><th class="money">Fees</th><th class="money">Withheld</th><th class="money">Net (${ctx.cur})</th></tr></thead>
    <tbody>${body}
      <tr class="total"><td colspan="4">${esc(label)} total${left ? ` · ${left} record${left === 1 ? "" : "s"} left out` : ""}</td><td class="money">${money(t.gross)}</td><td class="money">${money(-(t.platform_fee + t.payout_fee))}</td><td class="money">${money(-t.withheld)}</td><td class="money">${money(t.net)}</td></tr>
    </tbody></table></div>`;
}

export function mount(ctx, root) {
  root.querySelector("[data-type]")?.addEventListener("change", ev => {
    location.hash = ctx.href("ledger", { c: ctx.yours ? null : ctx.creator, p: ctx.period, f: ctx.query.get("f"), t: ev.target.value || null });
  });
  root.querySelector("[data-csv]")?.addEventListener("click", () => downloadCsv(ctx));
  const open = () => openPanel(ctx, root, () => {
    if (ctx.query.get("import")) history.replaceState(null, "", ctx.href("ledger", { c: ctx.creator, p: ctx.period, f: ctx.query.get("f"), t: ctx.query.get("t") }));
  });
  root.querySelector("[data-import-open]")?.addEventListener("click", open);
  if (ctx.query.get("import") && !ctx.yours) open();
}

// The ledger rows (as filtered on screen) as a CSV file the accountant can open.
export async function downloadCsv(ctx) {
  const L = await load(ctx);
  const rows = filtered(ctx, L.rows);
  const k = ctx.cur.toLowerCase();
  const amounts = ["gross", "platform_fee", "payout_fee", "withheld", "net"].map(x => `${x}_${k}`);
  const cols = ["date", "platform", "type", "ref", "original_currency", "original_gross", "fx_rate", "fx_date",
                ...(ctx.yours ? ["fx_source", "cny_rate", "cny_rate_date", "cny_rate_source"] : []), ...amounts];
  const val = r => [r.date, r.platform_label, r.type, r.ref ?? "", r.original.currency, r.original.gross, r.fx?.rate ?? "", r.fx?.rate_date ?? "",
                    ...(ctx.yours ? [r.fx?.source ?? "", r.fx_cny?.rate ?? "", r.fx_cny?.rate_date ?? "", r.fx_cny?.source ?? ""] : []),
                    ...amounts.map(a => r[a] ?? "")];
  const csv = [cols, ...rows.map(val)].map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })),
    download: ctx.yours ? `side-atlas-ledger-${ctx.period}.csv` : `side-atlas-ledger-${ctx.creator}-${ctx.period}.csv`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

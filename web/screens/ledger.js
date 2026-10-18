import { YOURS } from "../lib/copy.js";
import { cur, dateShort, esc, icon, mmdd, periodLabel, picon, usd, weekday } from "../lib/format.js";
import { emptyScreen, noRateText, th, top, warnCard } from "../lib/parts.js";
import { bindDropdowns, dropdown } from "../lib/dropdown.js";
import { mascot } from "../lib/mascot.js";
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
  const f = ctx.query.get("f"), t = ctx.query.get("t"), dir = ctx.query.get("s") === "new" ? -1 : 1;
  return rows.filter(r => (!f || r.platform === f) && (!t || r.type === t))
    .sort((a, b) => dir * a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform));
}

// Column headers (kit v1.4.1): each has an outline icon; Date sorts, Platform and Type filter through the
// shared dropdown, and an active filter shows its value in the accent colour.

function head(ctx, L, cols) {
  const f = ctx.query.get("f"), type = ctx.query.get("t"), sort = ctx.query.get("s") === "new" ? "new" : "old";
  const types = [...new Set(L.rows.filter(r => !f || r.platform === f).map(r => r.type))].sort();
  const plat = f && L.platforms.find(p => p.platform === f);
  const pick = (name, ic, text, on, value, options) => `<th>${dropdown({ name, label: name === "s" ? "Sort by date" : name === "f" ? "Filter by platform" : "Filter by type",
    cls: `th-pick${on ? " on" : ""}`, align: "start", value, options, trigger: `${icon(ic, "sm")}<span>${esc(text)}</span>` })}</th>`;
  return `<thead><tr>
    ${pick("s", "calendar", "Date", sort === "new", sort, [{ value: "old", label: "Oldest first" }, { value: "new", label: "Newest first" }])}
    ${pick("f", "layers", plat ? plat.label : "Platform", !!plat, f ?? "", [{ value: "", label: "All platforms" }, ...L.platforms.map(p => ({ value: p.platform, label: p.label, icon: picon(p.platform) }))])}
    ${pick("t", "tag", type || "Type", !!type, type ?? "", [{ value: "", label: "All types" }, ...types.map(x => ({ value: x, label: x }))])}
    ${cols}</tr></thead>`;
}

// The KPI row: outline icons like the table headers; Net is a small hero card with the orb and Atlas.
const kpi = (ic, label, fig, color) => `<div class="sa-card sa-kpi"><div class="label">${icon(ic, "sm")}${label}</div><div class="sa-fig num" style="${color ? `color:${color}` : ""}">${fig}</div></div>`;
const netKpi = (label, fig) => `<div class="sa-kpi net"><div class="orb"></div>${mascot("coin", "kpi-mascot")}<div class="label">${icon("wallet", "sm")}${label}</div><div class="sa-fig num">${fig}</div></div>`;

const csvBtn = `<button class="sa-btn secondary sm" data-csv>${icon("download", "sm")} CSV</button>`;

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
  const f = ctx.query.get("f");
  // One home for the totals: the KPI row follows the platform filter (no repeated total row).
  const k = (f && L.platforms.find(p => p.platform === f)) || t;

  const importBtn = `<button class="sa-btn primary sm" data-import-open>${icon("upload", "sm")} Import statements</button>`;
  return top(ctx, "Ledger", "", { actions: csvBtn + importBtn }) + `
  ${L.issues.length ? `<div class="sa-grid" style="margin-bottom:20px">${warnCard(ctx, L.issues)}</div>` : ""}
  <div class="sa-kpirow">
    ${[["coins", "Gross", k.gross, ""], ["percent", "Platform fees", -k.platform_fee, "var(--sa-fee-text)"], ["percent", "Payout fees", -k.payout_fee, "var(--sa-payout-text)"],
       ["bank", "Tax withheld", -k.withheld, "var(--sa-tax-text)"]]
      .map(([ic, l, v, c]) => kpi(ic, l, usd(v), c)).join("")}
    ${netKpi("Net", usd(k.net))}
  </div>
  <div class="sa-tablewrap"><table class="sa-table dense">
    ${head(ctx, L, th("fx", "Original") + th("coins", "Gross", "money") + th("percent", "Platform fee", "money") + th("percent", "Payout fee", "money") + th("bank", "Withheld", "money") + th("wallet", "Net", "money"))}
    <tbody>${rows.map(r => `<tr class="${r.net_usd == null ? "missing" : ""}">
      <td class="num">${mmdd(r.date)}</td>
      <td>${picon(r.platform)}${esc(r.platform_label)}</td>
      <td>${esc(r.type)}${r.ref ? `<span class="sub">${esc(r.ref)}</span>` : ""}</td>
      <td class="num">${original(r)}</td>
      ${r.gross_usd == null ? cell(null) : `<td class="money">${usd(r.gross_usd)}</td>`}${cell(r.platform_fee_usd, "fee")}${cell(r.payout_fee_usd, "payout")}${cell(r.withheld_usd, "tax")}${cell(r.net_usd, "net")}</tr>`).join("")}
    </tbody></table></div>`;
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
  const f = ctx.query.get("f");
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
    const head = `<td class="num">${mmdd(r.date)}</td><td>${picon(r.platform)}${esc(r.platform_label)}</td>
      <td>${esc(r.type)}${r.ref ? `<span class="sub">${esc(r.ref)}</span>` : ""}</td><td class="num">${orig(r)}</td>`;
    if (r.issue) {
      const i = issueFor(L, r);
      return `<tr class="missing">${head}<td class="money"><span class="sa-badge warn">rate missing</span>${i ? `<span class="rate miss">${esc(noRateText(i))}</span>` : ""}</td><td colspan="3" class="money meta">left out of totals</td></tr>`;
    }
    return `<tr>${head}<td class="money">${money(r[`gross_${k}`])}${conversions(r).map(x => rateLine(x, r.date)).join("")}</td>
      ${neg(r[`platform_fee_${k}`] + r[`payout_fee_${k}`], "fee")}${neg(r[`withheld_${k}`], "tax")}<td class="money net">${money(r[`net_${k}`])}</td></tr>`;
  }).join("");
  const label = periodLabel(ctx.period).split(" · ")[0];

  return top(ctx, "Ledger", "", { actions: csvBtn + ctx.currencySeg(ctx) }) + `
  ${L.issues.length ? `<div class="sa-grid" style="margin-bottom:16px">${warnCard(ctx, L.issues)}</div>` : ""}
  <div class="sa-kpirow">
    ${[["coins", "Gross", t.gross, ""], ["percent", "Fees", -(t.platform_fee + t.payout_fee), "var(--sa-fee-text)"], ["bank", "Tax withheld", -t.withheld, "var(--sa-tax-text)"]]
      .map(([ic, l, v, c]) => kpi(ic, l, money(v), c)).join("")}
    ${netKpi(L.issues.length ? "Net · incomplete" : "Net", money(t.net))}
    ${ratesCard}
  </div>
  ${curs.length ? `<div class="sa-note info" style="margin-bottom:14px">${icon("info", "sm")}<span>${withFile ? YOURS.LEDGER_FILE_NOTE : YOURS.LEDGER_ECB_NOTE}</span></div>` : ""}
  <div class="sa-tablewrap"><table class="sa-table dense">
    ${head(ctx, L, th("fx", "Original") + th("coins", `Gross (${ctx.cur})`, "money") + th("percent", "Fees", "money") + th("bank", "Withheld", "money") + th("wallet", `Net (${ctx.cur})`, "money"))}
    <tbody>${body}
      <tr class="total"><td colspan="4">${esc(label)} total · ${rows.length} record${rows.length === 1 ? "" : "s"}${left ? ` · ${left} record${left === 1 ? "" : "s"} left out` : ""}</td><td class="money">${money(t.gross)}</td><td class="money">${money(-(t.platform_fee + t.payout_fee))}</td><td class="money">${money(-t.withheld)}</td><td class="money">${money(t.net)}</td></tr>
    </tbody></table></div>`;
}

export function mount(ctx, root) {
  const by = col => v => {
    const q = { f: ctx.query.get("f"), t: ctx.query.get("t"), s: ctx.query.get("s") };
    q[col] = v && !(col === "s" && v === "old") ? v : null;
    if (col === "f") q.t = null; // types differ per platform
    location.hash = ctx.href("ledger", { c: ctx.yours ? null : ctx.creator, p: ctx.period, ...q });
  };
  bindDropdowns(root, { s: by("s"), f: by("f"), t: by("t") });
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

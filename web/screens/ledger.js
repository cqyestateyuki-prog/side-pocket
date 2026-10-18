import { V14, YOURS } from "../lib/copy.js";
import { cur, dateShort, esc, icon, mmdd, periodLabel, picon, usd, weekday } from "../lib/format.js";
import { emptyScreen, noRateText, th, top, warnCard } from "../lib/parts.js";
import { bindDropdowns, dropdown } from "../lib/dropdown.js";
import { mascot } from "../lib/mascot.js";
import { openPanel } from "../lib/importPanel.js";
import { openEntry } from "../lib/entrySheet.js";

// Kit 19 (v1.4): statement rows, the income you add and your expenses in one table, for either account.
// A quarter is its three months' ledgers; the totals and "kept after expenses" come from the report.
async function load(ctx) {
  if (ctx.period.includes("Q")) {
    const r = await ctx.load("report", { period: ctx.period });
    const books = await Promise.all(r.months.map(m => ctx.load("ledger", { month: m })));
    return { rows: books.flatMap(b => b.rows), entries: books.flatMap(b => b.entry_rows ?? []), totals: r.totals,
             platforms: r.by_platform, issues: r.issues, kept: r.kept_after_expenses, expenses: r.expenses };
  }
  const [l, o] = await Promise.all([
    ctx.load("ledger", { month: ctx.period }),
    ctx.load("overview", { month: ctx.period }),
  ]);
  return { rows: l.rows, entries: l.entry_rows ?? [], totals: l.totals, platforms: o.platforms, issues: l.issues,
           kept: l.kept_after_expenses, expenses: l.expenses };
}

const OWN = "__own", INCOME = "__income", EXPENSE = "__expense";

// Statement rows and entries in one list: an entry's "platform" is OWN and its type Income or Expense.
function items(L) {
  return [...L.rows.map(r => ({ ...r, entry: false })),
          ...L.entries.map(e => ({ ...e, entry: true, platform: OWN, type: e.kind === "income" ? V14.TYPE_INCOME : "Expense" }))];
}

function filtered(ctx, list) {
  const f = ctx.query.get("f"), t = ctx.query.get("t"), dir = ctx.query.get("s") === "new" ? -1 : 1;
  return list.filter(r => (!f || r.platform === f)
      && (!t || (t === INCOME ? r.kind !== "expense" : t === EXPENSE ? r.kind === "expense" : r.type === t)))
    .sort((a, b) => dir * a.date.localeCompare(b.date) || Number(a.entry) - Number(b.entry) || a.platform.localeCompare(b.platform));
}

// Column headers: an outline icon each; Date sorts, Source and Type filter through the shared dropdown,
// and an active filter shows its value in the accent colour.
function head(ctx, L, cols) {
  const f = ctx.query.get("f"), type = ctx.query.get("t"), sort = ctx.query.get("s") === "new" ? "new" : "old";
  const hasEntries = L.entries.length > 0, hasExpenses = L.entries.some(e => e.kind === "expense");
  const types = [...new Set(L.rows.filter(r => !f || r.platform === f).map(r => r.type))].sort();
  const plat = f && f !== OWN && L.platforms.find(p => p.platform === f);
  const typeLabel = { [INCOME]: V14.TYPE_INCOME, [EXPENSE]: V14.TYPE_EXPENSES }[type] ?? type;
  const pick = (name, ic, text, on, value, options) => `<th>${dropdown({ name, label: name === "s" ? "Sort by date" : name === "f" ? "Filter by source" : "Filter by type",
    cls: `th-pick${on ? " on" : ""}`, align: "start", value, options, trigger: `${icon(ic, "sm")}<span>${esc(text)}</span>` })}</th>`;
  const ring = `<i class="sa-pdot own"></i>`;
  return `<thead><tr>
    ${pick("s", "calendar", "Date", sort === "new", sort, [{ value: "old", label: "Oldest first" }, { value: "new", label: "Newest first" }])}
    ${pick("f", "layers", f === OWN ? V14.FILTER_OWN : plat ? plat.label : "Source", !!f, f ?? "", [{ value: "", label: V14.FILTER_ALL_SOURCES },
      ...L.platforms.map(p => ({ value: p.platform, label: p.label, icon: picon(p.platform) })),
      ...(hasEntries ? [{ value: OWN, label: V14.FILTER_OWN, icon: ring }] : [])])}
    ${pick("t", "tag", typeLabel || "Type", !!type, type ?? "", [{ value: "", label: "All types" },
      ...(f === OWN || !f ? [{ value: INCOME, label: V14.TYPE_INCOME }, ...(hasExpenses ? [{ value: EXPENSE, label: V14.TYPE_EXPENSES }] : [])] : []),
      ...(f === OWN ? [] : types.map(x => ({ value: x, label: x })))])}
    ${cols}</tr></thead>`;
}

// The KPI row: outline icons like the table headers; the last card is a small hero with the orb and Tilly.
const kpi = (ic, label, fig, color) => `<div class="sa-card sa-kpi"><div class="label">${icon(ic, "sm")}${label}</div><div class="sa-fig num" style="${color ? `color:${color}` : ""}">${fig}</div></div>`;
const netKpi = (label, fig) => `<div class="sa-kpi net"><div class="orb"></div>${mascot("coin", "kpi-mascot")}<div class="label">${icon("wallet", "sm")}${label}</div><div class="sa-fig num">${fig}</div></div>`;

function kpis(ctx, L, money) {
  const f = ctx.query.get("f"), p = f && f !== OWN && L.platforms.find(x => x.platform === f);
  const incomplete = L.issues.length ? " · incomplete" : "";
  if (p) {
    return [["coins", "Gross", p.gross, ""], ["percent", "Platform fees", -p.platform_fee, "var(--sa-fee-text)"],
            ["percent", "Payout fees", -p.payout_fee, "var(--sa-payout-text)"], ["bank", "Tax withheld", -p.withheld, "var(--sa-tax-text)"]]
      .map(([ic, l, v, c]) => kpi(ic, l, money(v), c)).join("") + netKpi(`Net${incomplete}`, money(p.net));
  }
  const t = L.totals, k = L.kept;
  return [["coins", V14.KPI_GROSS_INCOME, k?.gross_income ?? t.gross, ""], ["percent", "Fees", -(t.platform_fee + t.payout_fee), "var(--sa-fee-text)"],
          ["bank", "Tax withheld", -t.withheld, "var(--sa-tax-text)"], ["pencil", V14.KPI_EXPENSES, -(L.expenses?.total ?? 0), ""]]
    .map(([ic, l, v, c]) => kpi(ic, l, money(v), c)).join("") + netKpi(`${V14.KPI_KEPT}${incomplete}`, money(k?.kept ?? t.net));
}

const csvBtn = `<button class="sa-btn secondary sm" data-csv>${icon("download", "sm")} CSV</button>`;
const youTag = `<span class="sa-you">${icon("pencil", "sm")}${V14.YOU_TAG}</span>`;

// ---------------------------------------------------------------- rows

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

// The sample account's rate tables: the rate and its date under the original amount.
function demoFx(fx) {
  return fx?.rate ? `<span class="fx">${fx.currency === "CNY" ? "÷" : "×"} ${fx.rate.toFixed(4)} · ${fx.rate_date}</span>` : "";
}

const conversions = r => [r.fx, r.fx_cny].filter(x => x?.rate);
const issueFor = (L, r) => L.issues.find(i => i.date === r.date && i.platform === r.platform_label && (i.record?.ref ?? null) === (r.ref ?? null))
  ?? L.issues.find(i => i.date === r.date && i.platform === r.platform_label);

function statementRow(ctx, L, r, money) {
  const k = ctx.cur.toLowerCase();
  const neg = (v, cls) => v == null ? `<td class="money"><span class="sa-badge warn">rate missing</span></td>`
    : !v ? `<td class="money zero">—</td>` : `<td class="money ${cls}">${money(-v)}</td>`;
  const orig = ctx.yours
    ? `${cur(r.original.gross, r.original.currency)}<span class="sub">${esc(r.original.currency)}</span>`
    : r.original.currency === "USD" ? `<span class="meta">USD</span>`
    : `${cur(r.original.gross, r.original.currency)}${r.fx?.rate ? demoFx(r.fx) : `<span class="fx missing">no rate for ${r.date}</span>`}`;
  const lead = `<td class="num">${mmdd(r.date)}</td><td>${picon(r.platform)}${esc(r.platform_label)}</td>
      <td>${esc(r.type)}${r.ref ? `<span class="sub">${esc(r.ref)}</span>` : ""}</td><td class="num">${orig}</td>`;
  const pf = r[`platform_fee_${k}`], po = r[`payout_fee_${k}`];
  if (r.issue || r[`net_${k}`] == null) {
    const i = issueFor(L, r);
    return `<tr class="missing">${lead}<td class="money"><span class="sa-badge warn">rate missing</span>${ctx.yours && i ? `<span class="rate miss">${esc(noRateText(i))}</span>` : ""}</td><td colspan="3" class="money meta">left out of totals</td></tr>`;
  }
  return `<tr>${lead}<td class="money">${money(r[`gross_${k}`])}${ctx.yours ? conversions(r).map(x => rateLine(x, r.date)).join("") : ""}</td>
      ${neg(pf == null || po == null ? null : pf + po, "fee")}${neg(r[`withheld_${k}`], "tax")}<td class="money net">${money(r[`net_${k}`])}</td></tr>`;
}

function entryRow(ctx, e, money) {
  const k = ctx.cur.toLowerCase(), amount = e[`amount_${k}`], income = e.kind === "income";
  const label = income ? e.source : e.category;
  // Like a statement row: the original amount in its column, the conversion under the converted amount.
  const conv = e.original.currency === ctx.cur ? "" : ctx.yours ? conversions(e).map(x => rateLine(x, e.date)).join("") : "";
  const orig = `${cur(e.original.amount, e.original.currency)}<span class="sub">${esc(e.original.currency)}</span>${ctx.yours ? "" : demoFx(e.fx)}`;
  const lead = `<td class="num">${mmdd(e.date)}</td>
      <td><i class="sa-pdot ${income ? "own" : "exp"}"></i>${esc(label)}${youTag}</td>
      <td>${income ? V14.TYPE_INCOME : "Expense"}${!income && e.source ? `<span class="sub">${esc(e.source)}</span>` : ""}</td><td class="num">${orig}</td>`;
  const attrs = `class="entry ${income ? "income" : "expense"}${amount == null ? " missing" : ""}" data-entry="${esc(e.id)}" tabindex="0" title="Edit"`;
  if (amount == null) return `<tr ${attrs}>${lead}<td class="money"><span class="sa-badge warn">rate missing</span></td><td colspan="3" class="money meta">left out of totals</td></tr>`;
  return `<tr ${attrs}>${lead}<td class="money ${income ? "" : "zero"}">${income ? money(amount) + conv : "—"}</td>
      <td class="money zero">—</td><td class="money zero">—</td><td class="money ${income ? "net" : "exp"}">${money(income ? amount : -amount)}${income ? "" : conv}</td></tr>`;
}

// Totals: the server's when nothing narrows the rows (one rounding at the total), else the shown rows'.
function totalRow(ctx, L, rows, money) {
  const k = ctx.cur.toLowerCase(), f = ctx.query.get("f"), t = ctx.query.get("t");
  const label = periodLabel(ctx.period).split(" · ")[0];
  const n = rows.length, left = rows.filter(r => r.issue || (r.entry ? r[`amount_${k}`] == null : r[`net_${k}`] == null)).length;
  const text = `${V14.TOTAL_ROW.replace("{period}", esc(label)).replace("{n}", n).replace("records", n === 1 ? "record" : "records")}${left ? ` · ${left} left out` : ""}`;
  let gross, fees, withheld, net;
  const p = f && f !== OWN && !t && L.platforms.find(x => x.platform === f);
  if (!f && !t) {
    gross = L.kept?.gross_income ?? L.totals.gross; fees = L.totals.platform_fee + L.totals.payout_fee;
    withheld = L.totals.withheld; net = L.kept?.kept ?? L.totals.net;
  } else if (p) {
    gross = p.gross; fees = p.platform_fee + p.payout_fee; withheld = p.withheld; net = p.net;
  } else {
    const sum = fn => Math.round(rows.reduce((s, r) => s + (fn(r) ?? 0), 0) * 100) / 100;
    gross = sum(r => (r.entry ? (r.kind === "income" ? r[`amount_${k}`] : 0) : r[`gross_${k}`]));
    fees = sum(r => (r.entry ? 0 : (r[`platform_fee_${k}`] ?? 0) + (r[`payout_fee_${k}`] ?? 0)));
    withheld = sum(r => (r.entry ? 0 : r[`withheld_${k}`]));
    net = sum(r => (r.entry ? (r.kind === "income" ? 1 : -1) * (r[`amount_${k}`] ?? 0) : r[`net_${k}`]));
  }
  return `<tr class="total"><td colspan="4">${text}</td><td class="money">${money(gross)}</td><td class="money">${money(-fees)}</td><td class="money">${money(-withheld)}</td><td class="money">${money(net)}</td></tr>`;
}

// ---------------------------------------------------------------- the screen

export async function render(ctx) {
  if (ctx.yours && !ctx.has) return emptyScreen(ctx, "Ledger", YOURS.EMPTY_LEDGER);
  const money = ctx.money ?? usd;
  const L = await load(ctx);
  const rows = filtered(ctx, items(L));
  const body = rows.map(r => (r.entry ? entryRow(ctx, r, money) : statementRow(ctx, L, r, money))).join("");

  // Where the rates for converted records came from (My uploads): the person's rate file, used exactly,
  // or ECB reference rates for a currency without one.
  let note = "";
  if (ctx.yours) {
    const converted = L.rows.filter(r => r.issue || conversions(r).length);
    const withFile = L.rows.some(r => conversions(r).some(x => /rate file/.test(x.source ?? ""))) || L.issues.some(i => i.reason === "not_in_rate_file")
      || ctx.data.files.some(f => f.kind === "rates");
    if (converted.length) note = `<div class="sa-note info" style="margin-bottom:14px">${icon("info", "sm")}<span>${withFile ? YOURS.LEDGER_FILE_NOTE : YOURS.LEDGER_ECB_NOTE}</span></div>`;
  }
  const actions = (ctx.yours ? `<a class="sa-btn secondary sm" href="#mydata">${icon("upload", "sm")} ${V14.ADD_STATEMENTS}</a>`
      : `<button class="sa-btn secondary sm" data-import-open>${icon("upload", "sm")} ${V14.ADD_STATEMENTS}</button>`)
    + `<button class="sa-btn primary sm" data-entry-new>${icon("plus", "sm")} Add entry</button>` + csvBtn + ctx.currencySeg(ctx);
  const cols = th("fx", "Original") + th("coins", ctx.yours ? `Gross (${ctx.cur})` : "Gross", "money") + th("percent", "Fees", "money")
    + th("bank", "Withheld", "money") + th("wallet", ctx.yours ? `Net (${ctx.cur})` : "Net", "money");

  return top(ctx, "Ledger", "", { actions }) + `
  ${L.issues.length ? `<div class="sa-grid" style="margin-bottom:16px">${warnCard(ctx, L.issues)}</div>` : ""}
  <div class="sa-kpirow">${kpis(ctx, L, money)}</div>
  ${note}
  <div class="sa-tablewrap"><table class="sa-table dense ledger-v14">
    ${head(ctx, L, cols)}
    <tbody>${body}${totalRow(ctx, L, rows, money)}</tbody></table></div>`;
}

export function mount(ctx, root) {
  const by = col => v => {
    const q = { f: ctx.query.get("f"), t: ctx.query.get("t"), s: ctx.query.get("s") };
    q[col] = v && !(col === "s" && v === "old") ? v : null;
    if (col === "f") q.t = null; // types differ per source
    location.hash = ctx.href("ledger", { c: ctx.yours ? null : ctx.creator, p: ctx.period, ...q });
  };
  bindDropdowns(root, { s: by("s"), f: by("f"), t: by("t") });
  root.querySelector("[data-csv]")?.addEventListener("click", () => downloadCsv(ctx));
  root.querySelector("[data-entry-new]")?.addEventListener("click", () => openEntry(ctx));
  root.querySelectorAll("tr[data-entry]").forEach(tr => {
    const edit = () => openEntry(ctx, tr.dataset.entry);
    tr.addEventListener("click", edit);
    tr.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); edit(); } });
  });
  const open = () => openPanel(ctx, root, () => {
    if (ctx.query.get("import")) history.replaceState(null, "", ctx.href("ledger", { c: ctx.creator, p: ctx.period, f: ctx.query.get("f"), t: ctx.query.get("t") }));
  });
  root.querySelector("[data-import-open]")?.addEventListener("click", open);
  if (ctx.query.get("import") && !ctx.yours) open();
  if (ctx.query.get("entry") === "new") openEntry(ctx);
}

// The ledger rows (as filtered on screen), entries included, as a CSV file the accountant can open.
export async function downloadCsv(ctx) {
  const L = await load(ctx);
  const rows = filtered(ctx, items(L));
  const k = ctx.cur.toLowerCase();
  const amounts = ["gross", "platform_fee", "payout_fee", "withheld", "net"].map(x => `${x}_${k}`);
  const cols = ["date", "source", "type", "ref", "original_currency", "original_amount", "fx_rate", "fx_date",
                ...(ctx.yours ? ["fx_source", "cny_rate", "cny_rate_date", "cny_rate_source"] : []), ...amounts];
  const val = r => {
    const fx = [r.fx?.rate ?? "", r.fx?.rate_date ?? "", ...(ctx.yours ? [r.fx?.source ?? "", r.fx_cny?.rate ?? "", r.fx_cny?.rate_date ?? "", r.fx_cny?.source ?? ""] : [])];
    if (r.entry) {
      const a = r[`amount_${k}`] ?? "", income = r.kind === "income";
      return [r.date, income ? r.source : r.category, income ? "Income (added by you)" : "Expense (added by you)", income ? "" : r.source ?? "",
              r.original.currency, r.original.amount, ...fx, income ? a : "", "", "", "", a === "" ? "" : income ? a : -a];
    }
    return [r.date, r.platform_label, r.type, r.ref ?? "", r.original.currency, r.original.gross, ...fx, ...amounts.map(x => r[x] ?? "")];
  };
  const csv = [cols, ...rows.map(val)].map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })),
    download: ctx.yours ? `side-pocket-ledger-${ctx.period}.csv` : `side-pocket-ledger-${ctx.creator}-${ctx.period}.csv`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

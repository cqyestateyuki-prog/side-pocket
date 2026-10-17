import { get } from "../lib/api.js";
import { COPY } from "../lib/copy.js";
import { cur, esc, icon, mmdd, pcol, periodLabel, usd } from "../lib/format.js";
import { top, warnCard } from "../lib/parts.js";

async function load(ctx) {
  if (ctx.period.includes("Q")) {
    const r = await get("report", { creator: ctx.creator, period: ctx.period });
    const books = await Promise.all(r.months.map(m => get("ledger", { creator: ctx.creator, month: m })));
    return { rows: books.flatMap(b => b.rows), totals: r.totals, platforms: r.by_platform, issues: r.issues };
  }
  const [l, o] = await Promise.all([
    get("ledger", { creator: ctx.creator, month: ctx.period }),
    get("overview", { creator: ctx.creator, month: ctx.period }),
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
  const L = await load(ctx);
  const t = L.totals;
  const rows = filtered(ctx, L.rows);
  const f = ctx.query.get("f"), type = ctx.query.get("t");
  const types = [...new Set(L.rows.filter(r => !f || r.platform === f).map(r => r.type))].sort();
  const link = extra => ctx.href("ledger", { c: ctx.creator, p: ctx.period, f, t: type, ...extra });
  const totalRow = !type && (f ? L.platforms.find(p => p.platform === f) : t);
  const label = periodLabel(ctx.period).split(" · ")[0];

  return top(ctx, "Ledger", COPY.LEDGER_INTRO) + `
  ${L.issues.length ? `<div class="sa-grid" style="margin-bottom:20px">${warnCard(ctx, L.issues)}</div>` : ""}
  <div class="sa-kpirow">
    ${[["Gross", t.gross, ""], ["Platform fees", -t.platform_fee, "var(--sa-fee-text)"], ["Payout fees", -t.payout_fee, "var(--sa-payout-text)"],
       ["Tax withheld", -t.withheld, "var(--sa-tax-text)"], ["Net", t.net, "var(--sa-forest)"]]
      .map(([l, v, c]) => `<div class="sa-card sa-kpi"><div class="label">${l}</div><div class="sa-fig num" style="${c ? `color:${c}` : ""}">${usd(v)}</div></div>`).join("")}
  </div>
  <div class="sa-filters">
    <a class="sa-chip ${f ? "" : "on"}" href="${link({ f: null, t: null })}">All · ${L.rows.length} records</a>
    ${L.platforms.map(p => `<a class="sa-chip ${f === p.platform ? "on" : ""}" href="${link({ f: f === p.platform ? null : p.platform, t: null })}"><i class="dot" style="background:${pcol(p.platform).fill}"></i>${p.label}</a>`).join("")}
    <label class="sa-btn secondary sm select">${icon("filter", "sm")} ${type ? esc(type) : "Type"}
      <select data-type aria-label="Record type"><option value="">All types</option>${types.map(x => `<option ${x === type ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
    <button class="sa-btn secondary sm" data-csv>${icon("download", "sm")} CSV</button>
  </div>
  <div class="sa-tablewrap"><table class="sa-table dense">
    <thead><tr><th>Date</th><th>Platform</th><th>Type</th><th>Original</th><th class="money">Gross</th><th class="money">Platform fee</th><th class="money">Payout fee</th><th class="money">Withheld</th><th class="money">Net</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.net_usd == null ? "missing" : ""}">
      <td class="num">${mmdd(r.date)}</td>
      <td><i class="sa-pdot" style="background:${pcol(r.platform).fill}"></i>${esc(r.platform_label)}</td>
      <td>${esc(r.type)}${r.ref ? `<span class="sub">${esc(r.ref)}</span>` : ""}</td>
      <td class="num">${original(r)}</td>
      ${r.gross_usd == null ? cell(null) : `<td class="money">${usd(r.gross_usd)}</td>`}${cell(r.platform_fee_usd, "fee")}${cell(r.payout_fee_usd, "payout")}${cell(r.withheld_usd, "tax")}${cell(r.net_usd, "net")}</tr>`).join("")}
      ${totalRow ? `<tr class="total"><td colspan="4">${f ? `${totalRow.label} · ` : ""}${label} total</td><td class="money">${usd(totalRow.gross)}</td><td class="money">${usd(-totalRow.platform_fee)}</td><td class="money">${usd(-totalRow.payout_fee)}</td><td class="money">${usd(-totalRow.withheld)}</td><td class="money">${usd(totalRow.net)}</td></tr>` : ""}
    </tbody></table></div>`;
}

export function mount(ctx, root) {
  root.querySelector("[data-type]")?.addEventListener("change", ev => {
    location.hash = ctx.href("ledger", { c: ctx.creator, p: ctx.period, f: ctx.query.get("f"), t: ev.target.value || null });
  });
  root.querySelector("[data-csv]")?.addEventListener("click", () => downloadCsv(ctx));
}

// The ledger rows (as filtered on screen) as a CSV file the accountant can open.
export async function downloadCsv(ctx) {
  const L = await load(ctx);
  const rows = filtered(ctx, L.rows);
  const cols = ["date", "platform", "type", "ref", "original_currency", "original_gross", "fx_rate", "fx_date",
                "gross_usd", "platform_fee_usd", "payout_fee_usd", "withheld_usd", "net_usd"];
  const val = r => [r.date, r.platform_label, r.type, r.ref ?? "", r.original.currency, r.original.gross, r.fx?.rate ?? "",
                    r.fx?.rate_date ?? "", r.gross_usd ?? "", r.platform_fee_usd ?? "", r.payout_fee_usd ?? "", r.withheld_usd ?? "", r.net_usd ?? ""];
  const csv = [cols, ...rows.map(val)].map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })),
    download: `side-atlas-ledger-${ctx.creator}-${ctx.period}.csv`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

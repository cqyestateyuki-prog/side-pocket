import { COPY, YOURS } from "../lib/copy.js";
import { dateLong, esc, icon, monthName, periodLabel, usd } from "../lib/format.js";
import { COUNTRY, emptyScreen, top, warnCard } from "../lib/parts.js";
import { downloadCsv } from "./ledger.js";
import { setAside } from "../lib/prefs.js";

const HOME = { US: "US tax home", CN: "China tax home", BOTH: "US and China tax home" };
const shortDate = d => new Date(d + "T12:00:00").toLocaleString("en-US", { month: "short", day: "numeric" });

export async function render(ctx) {
  if (ctx.yours && !ctx.has) return emptyScreen(ctx, "Report", YOURS.EMPTY_TAX);
  const money = ctx.money ?? usd, k = ctx.cur.toLowerCase();
  const R = await ctx.load("report", { period: ctx.period });
  const t = R.totals, tax = R.tax, F = tax.forms;
  const p = ctx.persona(R.creator);
  const label = periodLabel(ctx.period).split(" · ")[0];
  const due = tax.next_us_estimated_tax_due;
  const T4 = F?.applies === false ? null : F?.totals_for_platforms_with_forms;
  const dups = F?.possible_duplicate_reports ?? [];
  const sa = setAside(ctx.yours ? "yours" : ctx.creator, { totalNet: t.net, byPlatform: R.by_platform, api: tax.set_aside, rate: ctx.yours ? ctx.data.settings.set_aside_rate : null });
  const cnWin = (tax.by_country ?? []).find(c => c.country === "CN")?.deadlines.find(d => d.id === "cn_annual_reconciliation");
  const meta = ctx.yours ? `Your data · ${HOME[ctx.data.settings.tax_home]} · shown in ${ctx.cur}`
    : `${esc(p.display)}${p.display !== p.name ? ` (<span class="cjk">${esc(p.name)}</span>)` : ""} · ${esc(p.meta)}`;

  return top(ctx, "Report", periodLabel(ctx.period)) + `
  <div class="sa-grid">
    ${warnCard(ctx, R.issues)}
    <div class="c8 sa-sheet" id="sheet">
      <div class="band"><div class="label">Side Atlas · ${label} report</div><h1>${COPY.REPORT_COVER}</h1>
        <div class="meta">${meta} · prepared ${dateLong(R.generated_on)}</div></div>
      <div class="body">
        <div class="sa-totals">${[["Gross", t.gross], ["Platform fees", -t.platform_fee], ["Payout fees", -t.payout_fee], ["Tax withheld", -t.withheld]].map(([l, v]) => `<div><span class="label">${l}</span><b>${money(v)}</b></div>`).join("")}<div class="net"><span class="label">Net</span><b>${money(t.net)}</b></div></div>
        ${R.by_month.length > 1 ? `<h3>By month</h3>
        <table class="sa-table"><thead><tr><th>Month</th><th class="money">Gross</th><th class="money">Platform fees</th><th class="money">Payout fees</th><th class="money">Tax withheld</th><th class="money">Net</th></tr></thead>
          <tbody>${R.by_month.map(m => `<tr><td>${monthName(m.month)}${m.complete ? "" : ` <span class="sa-badge warn">incomplete</span>`}</td><td class="money">${money(m.gross)}</td><td class="money fee">${money(-m.platform_fee)}</td><td class="money payout">${money(-m.payout_fee)}</td><td class="money tax">${money(-m.withheld)}</td><td class="money net">${money(m.net)}</td></tr>`).join("")}</tbody></table>` : ""}
        <h3>Tax items</h3>
        <ul class="sa-lines">
          ${tax.tax_withheld_by_platform.map(w => `<li><span>Tax withheld by ${esc(w.platform)} (${COUNTRY[w.country] ?? w.country})</span><span class="amt">${money(w[`withheld_${k}`])}</span></li>`).join("") || `<li><span>Tax withheld by platforms</span><span class="amt">none</span></li>`}
          <li><span>Set aside at ${Math.round(sa.rate * 100)}%${sa.excluded.size ? ` of ${money(sa.base)} (some platforms left out)` : ""}</span><span class="amt">${money(sa.amount)}</span></li>
          ${due?.due_date ? `<li><span>Next US estimated-tax payment</span><span class="amt">${dateLong(due.due_date)}</span></li>` : ""}
          ${ctx.yours && cnWin ? `<li><span>China annual filing window for ${+cnWin.opens.slice(0, 4) - 1}</span><span class="amt">${shortDate(cnWin.opens)} to ${dateLong(cnWin.closes)}</span></li>` : ""}
          ${T4 ? `<li><span>Forms would show (platforms with forms)</span><span class="amt">${usd(T4.form_view_gross_usd)}</span></li>
          <li><span>Landed from those platforms · gap</span><span class="amt">${usd(T4.bank_view_landed_usd)} · ${usd(-T4.gap_usd)}</span></li>` : ""}
          ${dups.length ? `<li><span>Possible duplicate reports</span><span class="amt">${dups.map(esc).join(", ")}</span></li>` : ""}
        </ul>
        <div class="meta foot">${R.fx_used.length} exchange rate${R.fx_used.length === 1 ? "" : "s"} used, each on its record’s own date.${ctx.yours ? "" : " Fees are simulated assumptions."} ${COPY.DISCLAIMER}</div>
      </div>
    </div>
    <div class="c4 stack no-print">
      <a class="sa-btn secondary sm back" href="${ctx.href("tax", { c: ctx.yours ? null : ctx.creator, p: ctx.period })}">${icon("chevron", "sm flip")} Back to Tax</a>
      <section class="sa-card"><div class="head"><h2>Export</h2></div>
        <div class="stack" style="gap:10px"><button class="sa-btn primary" data-print>${icon("download", "sm")} PDF for my accountant</button>
          <button class="sa-btn secondary" data-csv>${icon("ledger", "sm")} Ledger as CSV</button></div></section>
    </div>
  </div>`;
}

export function mount(ctx, root) {
  root.querySelector("[data-print]")?.addEventListener("click", () => window.print());
  root.querySelector("[data-csv]")?.addEventListener("click", () => downloadCsv({ ...ctx, query: new URLSearchParams() }));
}

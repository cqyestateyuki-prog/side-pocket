import { get } from "../lib/api.js";
import { COPY } from "../lib/copy.js";
import { dateLong, icon, monthName, pcol, pct, periodLabel, usd } from "../lib/format.js";
import { empty, top, warnCard } from "../lib/parts.js";

// One shape for a month (/api/overview) or a quarter (/api/report).
async function load(ctx) {
  if (ctx.period.includes("Q")) {
    const r = await get("report", { creator: ctx.creator, period: ctx.period });
    return { totals: r.totals, platforms: r.by_platform, best: r.best_keep_rate, setAside: r.tax.set_aside,
             due: r.tax.next_us_estimated_tax_due, issues: r.issues, complete: r.complete, mom: null, months: r.months };
  }
  const [o, t] = await Promise.all([
    get("overview", { creator: ctx.creator, month: ctx.period }),
    get("tax-items", { creator: ctx.creator, period: ctx.period }),
  ]);
  return { totals: o.totals, platforms: o.platforms, best: o.best_keep_rate, setAside: o.set_aside,
           due: t.next_us_estimated_tax_due, issues: o.issues, complete: o.complete, mom: o.month_over_month, months: [o.month] };
}

export async function render(ctx) {
  const o = await load(ctx);
  const t = o.totals;
  const currencies = [...new Set(o.platforms.flatMap(p => p.currencies ?? []))];
  const label = periodLabel(ctx.period).split(" · ")[0];
  const sub = `${label} · ${o.platforms.length} platform${o.platforms.length === 1 ? "" : "s"} · ${currencies.length} currenc${currencies.length === 1 ? "y" : "ies"}`;
  const head = top(ctx, "Overview", sub);
  if (!t.gross) return head + `<div class="sa-grid">${warnCard(ctx, o.issues)}${empty("No income recorded for this period.", "Pick another month, or another creator.")}</div>`;

  const isQ = ctx.period.includes("Q");
  const plats = [...o.platforms].sort((a, b) => b.net - a.net);
  const lowest = [...o.platforms].sort((a, b) => a.net_rate - b.net_rate)[0];
  const foreign = currencies.filter(c => c !== "USD");
  const mom = o.mom;
  const wf = [["Platform fees", t.platform_fee, "var(--sa-fee)"], ["Payout & payment fees", t.payout_fee, "var(--sa-payout)"],
              ["Tax withheld by platforms", t.withheld, "var(--sa-tax)"]];
  const bar = [["Net", t.net, "var(--sa-net)"], ...wf];
  const due = o.due;

  return head + `
  <div class="sa-grid">
    ${warnCard(ctx, o.issues)}
    <section class="sa-hero c7">
      <div class="orb"></div>
      <div class="lead">${COPY.OVERVIEW_HERO.replace("{month}", isQ ? label : monthName(ctx.period))}</div>
      <div class="sa-fig num">${usd(t.net)}</div>
      <div class="sub">from <b class="num">${usd(t.gross)}</b> gross across ${o.platforms.length} platform${o.platforms.length === 1 ? "" : "s"}</div>
      <div class="chips">
        ${o.complete ? "" : `<span class="glass">${icon("alert", "sm")} Incomplete · ${o.issues.length} record${o.issues.length === 1 ? "" : "s"} waiting for a rate</span>`}
        ${mom ? `<span class="glass">${icon(mom.change >= 0 ? "up" : "down", "sm")} ${usd(mom.change)} vs ${monthName(mom.previous_month)}${mom.change_pct != null ? ` (${mom.change_pct > 0 ? "+" : ""}${pct(mom.change_pct)})` : ""}</span>` : ""}
        ${isQ ? `<span class="glass">${icon("calendar", "sm")} ${o.months.length} months</span>` : ""}
        ${foreign.length ? `<span class="glass">${icon("fx", "sm")} ${foreign.join(" & ")} converted at each record’s own date</span>` : ""}
      </div>
    </section>
    <div class="c5 stack">
      <div class="sa-card sa-kpi"><div class="label">${icon("tax", "sm")} Set aside at your ${Math.round(o.setAside.rate * 100)}%</div>
        <div class="sa-fig forest num">${usd(o.setAside.amount)}</div>
        <div class="note">${ctx.me.tax_country !== "US" ? `${ctx.me.tax_country} tax home · US estimated-tax dates don’t apply` : due?.due_date ? `Next US estimated tax: <b>${dateLong(due.due_date)}</b> · ${due.days_left} days` : "No upcoming US estimated-tax date in the schedule."}</div></div>
      <div class="sa-card sa-kpi"><div class="label">${icon("check", "sm")} Keeps the most of each dollar</div>
        <div class="kpi-row"><div class="sa-fig num">${o.best?.label ?? "—"}</div>${o.best ? `<span class="sa-badge ok">${pct(o.best.net_rate)} kept</span>` : ""}</div>
        <div class="note">${o.platforms.length > 1 ? `Lowest: ${lowest.label} keeps ${pct(lowest.net_rate)}${lowest.platform_fee ? ` after a ${pct(lowest.platform_fee / lowest.gross)} platform share` : ""}` : "Only one platform this period."}</div></div>
    </div>
    <section class="sa-card c7">
      <div class="head"><h2>Where the gross went</h2><span class="meta num">${usd(t.gross)} gross</span></div>
      <div class="sa-bar">${bar.map(([l, v, c]) => v > 0 ? `<span title="${l}" style="width:${(v / t.gross * 100).toFixed(2)}%;background:${c}"></span>` : "").join("")}</div>
      <ul class="sa-legend">
        <li><span class="dot" style="background:var(--sa-line-strong)"></span><span>Gross income</span><span class="amt">${usd(t.gross)}</span><span class="pct">100%</span></li>
        ${wf.map(([l, v, c]) => `<li><span class="dot" style="background:${c}"></span><span>${l}</span><span class="amt">${usd(-v)}</span><span class="pct">${pct(v / t.gross)}</span></li>`).join("")}
        <li class="total"><span class="dot" style="background:var(--sa-net)"></span><span>Net — what landed</span><span class="amt">${usd(t.net)}</span><span class="pct">${pct(t.net / t.gross)}</span></li>
      </ul>
    </section>
    <section class="sa-card c5">
      <div class="head"><h2>By platform</h2><span class="meta">share of net</span></div>
      <div class="sa-bar">${plats.map(p => `<span title="${p.label}" style="width:${(p.share_of_net * 100).toFixed(2)}%;background:${pcol(p.platform).fill}"></span>`).join("")}</div>
      <ul class="sa-legend">${plats.map(p => `<li><span class="dot round" style="background:${pcol(p.platform).fill}"></span><span>${p.label}</span><span class="amt">${usd(p.net)}</span><span class="pct">${pct(p.net_rate)} kept</span></li>`).join("")}</ul>
    </section>
  </div>`;
}

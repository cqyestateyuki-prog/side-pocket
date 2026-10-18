import { COPY, YOURS } from "../lib/copy.js";
import { icon, monthName, pcol, pct, periodLabel, picon } from "../lib/format.js";
import { empty, emptyScreen, top, warnCard } from "../lib/parts.js";
import { mascot } from "../lib/mascot.js";

// One shape for a month (overview) or a quarter (report), from the demo or from Your data.
async function load(ctx) {
  if (ctx.period.includes("Q")) {
    const r = await ctx.load("report", { period: ctx.period });
    return { totals: r.totals, platforms: r.by_platform, best: r.best_keep_rate, issues: r.issues, complete: r.complete, mom: null };
  }
  const o = await ctx.load("overview", { month: ctx.period });
  return { totals: o.totals, platforms: o.platforms, best: o.best_keep_rate, issues: o.issues, complete: o.complete, mom: o.month_over_month };
}

// The one-line link to Tax says what the Tax screen holds for this tax home.
function taxLinkText(ctx) {
  const home = ctx.yours ? ctx.data.settings.tax_home : ctx.me.tax_country;
  if (ctx.yours && home === "CN") return "Tax withheld in China and the annual filing window";
  if (ctx.yours && home === "BOTH") return "Set-aside, tax withheld, the next US estimated-tax date and China’s filing window";
  return `Set-aside, tax withheld${home === "US" ? " and the next US estimated-tax date" : ""}`;
}

export async function render(ctx) {
  if (ctx.yours && !ctx.has) return emptyScreen(ctx, "Overview", YOURS.EMPTY_OVERVIEW);
  const usd = ctx.money;
  const o = await load(ctx);
  const t = o.totals;
  const currencies = [...new Set(o.platforms.flatMap(p => p.currencies ?? []))];
  const label = periodLabel(ctx.period).split(" · ")[0];
  const head = top(ctx, "Overview", "", { actions: ctx.currencySeg(ctx) });
  if (!t.gross) return head + `<div class="sa-grid">${warnCard(ctx, o.issues)}${empty("No income recorded for this period.", ctx.yours ? "Pick another month." : "Pick another month, or another creator.")}</div>`;

  const isQ = ctx.period.includes("Q");
  const plats = [...o.platforms].sort((a, b) => b.net - a.net);
  const foreign = currencies.filter(c => c !== ctx.cur);
  const mom = o.mom;
  const wf = [["Platform fees", t.platform_fee, "var(--sa-fee)"], ["Payout & payment fees", t.payout_fee, "var(--sa-payout)"],
              ["Tax withheld by platforms", t.withheld, "var(--sa-tax)"]];
  const bar = [["Net", t.net, "var(--sa-net)"], ...wf];

  const best = o.best?.platform;
  const patreon = o.platforms.find(p => p.platform === "patreon" && p.ios_simulation && p.ios_pledges > 0);

  return head + `
  <div class="sa-grid">
    ${warnCard(ctx, o.issues)}
    <section class="sa-hero c7">
      <div class="orb"></div>
      ${mascot("wave", "hero-mascot")}
      <div class="lead">${COPY.OVERVIEW_HERO.replace("{month}", isQ ? label : monthName(ctx.period))}</div>
      <div class="sa-fig num">${usd(t.net)}</div>
      <div class="sub">from <b class="num">${usd(t.gross)}</b> gross across ${o.platforms.length} platform${o.platforms.length === 1 ? "" : "s"}</div>
      <div class="chips">
        ${o.complete ? "" : `<span class="glass">${icon("alert", "sm")} Incomplete · ${o.issues.length} record${o.issues.length === 1 ? "" : "s"} waiting for a rate</span>`}
        ${mom ? `<span class="glass">${icon(mom.change >= 0 ? "up" : "down", "sm")} ${usd(mom.change)} vs ${monthName(mom.previous_month)}${mom.change_pct != null ? ` (${mom.change_pct > 0 ? "+" : ""}${pct(mom.change_pct)})` : ""}</span>` : ""}
        ${foreign.length ? `<span class="glass">${icon("fx", "sm")} ${foreign.join(" & ")} converted using record-date rates</span>` : ""}
      </div>
    </section>
    <section class="sa-card c5">
      <div class="head"><h2>Platform breakdown</h2><span class="meta">Net · share of gross</span></div>
      <div class="sa-bar">${plats.map(p => `<span title="${p.label}" style="width:${(p.share_of_net * 100).toFixed(2)}%;background:${pcol(p.platform).fill}"></span>`).join("")}</div>
      <ul class="sa-legend">${plats.map(p => `<li class="${p.platform === best && o.platforms.length > 1 ? "best" : ""}">${picon(p.platform)}<span>${p.label}${p.platform === best && o.platforms.length > 1 ? ` <span class="sa-badge ok">keeps the most</span>` : ""}</span><span class="amt">${usd(p.net)}</span><span class="pct">${pct(p.net_rate)}</span></li>`).join("")}</ul>
    </section>
    <section class="sa-card c7">
      <div class="head"><h2>Gross income breakdown</h2></div>
      <div class="sa-bar">${bar.map(([l, v, c]) => v > 0 ? `<span title="${l}" style="width:${(v / t.gross * 100).toFixed(2)}%;background:${c}"></span>` : "").join("")}</div>
      <ul class="sa-legend">
        <li><span class="dot" style="background:var(--sa-line-strong)"></span><span>Gross income</span><span class="amt">${usd(t.gross)}</span><span class="pct">100%</span></li>
        ${wf.map(([l, v, c]) => `<li><span class="dot" style="background:${c}"></span><span>${l}</span><span class="amt">${usd(-v)}</span><span class="pct">${pct(v / t.gross)}</span></li>`).join("")}
        <li class="total"><span class="dot" style="background:var(--sa-net)"></span><span>Net (what landed)</span><span class="amt">${usd(t.net)}</span><span class="pct">${pct(t.net / t.gross)}</span></li>
      </ul>
    </section>
    <div class="c5 stack">
      ${patreon ? `<section class="sa-card sa-kpi">
        <div class="label">${icon("info", "sm")} Patreon iOS · simulated</div>
        <div class="kpi-row"><div class="sa-fig num">${usd(-patreon.ios_simulation.apple_fee)}</div><span class="sa-badge sim">${Math.round(patreon.ios_simulation.apple_fee_rate * 100)}% in-app cut</span></div>
        <div class="note">${usd(patreon.ios_pledges)} of ${usd(patreon.gross)} in Patreon pledges came through iOS. Moving those patrons to web pledges keeps this.</div>
      </section>` : ""}
      <a class="sa-card tax-link" href="${ctx.href("tax", { c: ctx.yours || ctx.creator === "C01" ? null : ctx.creator })}">${icon("tax", "sm")}<span>${taxLinkText(ctx)}</span><b>Tax ${icon("chevron", "sm rot")}</b></a>
    </div>
  </div>`;
}

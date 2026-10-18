import { COPY, V14, YOURS } from "../lib/copy.js";
import { esc, icon, monthName, pcol, pct, periodLabel, picon } from "../lib/format.js";
import { empty, emptyScreen, top, warnCard } from "../lib/parts.js";
import { mascot } from "../lib/mascot.js";
import { goalCard, latestCard } from "../lib/rewards.js";
import { openGoal } from "../lib/goalSheet.js";
import { openEntry } from "../lib/entrySheet.js";

// Kit 20 (v1.4): income first (platform net plus the income you add), then your goal and latest badge,
// income by source, and expenses with what you kept. A month is /overview, a quarter is /report.
async function load(ctx) {
  const o = ctx.period.includes("Q") ? await ctx.load("report", { period: ctx.period })
    : await ctx.load("overview", { month: ctx.period });
  return { totals: o.totals, platforms: o.platforms ?? o.by_platform, issues: o.issues, complete: o.complete,
           mom: o.income_month_over_month ?? null, sources: o.income_by_source ?? [], kept: o.kept_after_expenses,
           manual: o.manual_income, expenses: o.expenses, categories: o.expenses_by_category ?? [], goal: o.goal, badges: o.badges ?? [] };
}

const youTag = `<span class="sa-you">${icon("pencil", "sm")}${V14.YOU_TAG}</span>`;
const ring = `<span class="dot round own"></span>`;

export async function render(ctx) {
  if (ctx.yours && !ctx.has) return emptyScreen(ctx, "Overview", YOURS.EMPTY_OVERVIEW);
  const money = ctx.money;
  const o = await load(ctx);
  ctx.noteBadges(o.badges);
  const t = o.totals, k = o.kept;
  const income = k?.income ?? t.net, gross = k?.gross_income ?? t.gross;
  const label = periodLabel(ctx.period).split(" · ")[0];
  const head = top(ctx, "Overview", "", { actions: ctx.currencySeg(ctx) });
  if (!gross && !o.expenses?.total) return head + `<div class="sa-grid">${warnCard(ctx, o.issues)}${empty("No income recorded for this period.", ctx.yours ? "Pick another month." : "Pick another month, or another creator.")}</div>`;

  const isQ = ctx.period.includes("Q");
  const currencies = [...new Set(o.platforms.flatMap(p => p.currencies ?? []))].filter(c => c !== ctx.cur);
  const mom = o.mom, own = o.sources.filter(s => s.manual);
  const sources = [...o.sources].sort((a, b) => b.income - a.income);
  const maxCat = Math.max(0, ...o.categories.map(c => c.amount));
  const milestones = ctx.href("milestones", { c: ctx.yours || ctx.creator === "C01" ? null : ctx.creator });

  return head + `
  <div class="sa-grid">
    ${warnCard(ctx, o.issues)}
    <section class="sa-hero c7">
      <div class="orb"></div>
      ${mascot("wave", "hero-mascot")}
      <div class="lead">${COPY.OVERVIEW_HERO.replace("{month}", isQ ? label : monthName(ctx.period))}</div>
      <div class="sa-fig num">${money(income)}</div>
      <div class="sub">${V14.HERO_SUB.replace("{gross}", `<b class="num">${money(gross)}</b>`).replace("{n}", sources.length)}</div>
      <div class="chips">
        ${o.complete ? "" : `<span class="glass">${icon("alert", "sm")} Incomplete · ${o.issues.length} record${o.issues.length === 1 ? "" : "s"} waiting for a rate</span>`}
        ${mom?.change != null ? `<span class="glass">${icon(mom.change >= 0 ? "up" : "down", "sm")} ${money(mom.change)} vs ${monthName(mom.previous_month)}${mom.change_pct != null ? ` (${mom.change_pct > 0 ? "+" : ""}${pct(mom.change_pct)})` : ""}</span>` : ""}
        ${own.length ? `<span class="glass">${icon("pencil", "sm")} ${V14.CHIP_OWN.replace("{amount}", money(o.manual.total)).replace("{n}", own.length).replace("sources", own.length === 1 ? "source" : "sources")}</span>` : ""}
        ${currencies.length ? `<span class="glass">${icon("fx", "sm")} ${currencies.join(" & ")} converted using record-date rates</span>` : ""}
      </div>
    </section>
    <div class="c5 stack">${goalCard(o.goal)}${latestCard(o.badges, milestones)}</div>
    <section class="sa-card c7">
      <div class="head"><h2>${V14.INCOME_BY_SOURCE}</h2><span class="meta">${V14.INCOME_BY_SOURCE_META}</span></div>
      <div class="sa-bar">${sources.map(s => `<span title="${esc(s.source)}" class="${s.manual ? "own" : ""}" style="width:${((s.share ?? 0) * 100).toFixed(2)}%;${s.manual ? "" : `background:${pcol(s.platform).fill}`}"></span>`).join("")}</div>
      <ul class="sa-legend">${sources.map(s => `<li>${s.manual ? ring : picon(s.platform)}<span>${esc(s.source)}${s.manual ? youTag : ""}</span><span class="amt">${money(s.income)}</span><span class="pct">${pct(s.share ?? 0)}</span></li>`).join("")}</ul>
    </section>
    <section class="sa-card c5">
      <div class="head"><h2>${V14.EXPENSES_BY_CATEGORY}</h2><span class="meta">${V14.ENTRIES_COUNT.replace("{n}", o.expenses?.entries ?? 0)}</span></div>
      ${o.categories.length ? `<ul class="sa-catbars">${o.categories.map(c => `<li><span>${esc(c.category)}</span><span class="amt">${money(-c.amount)}</span><span class="track"><i style="width:${(maxCat ? c.amount / maxCat * 100 : 0).toFixed(1)}%"></i></span></li>`).join("")}</ul>`
        : `<div class="no-exp"><span class="meta">${V14.NO_EXPENSES}</span><button type="button" class="sa-btn secondary sm" data-entry-new>${icon("plus", "sm")} Add entry</button></div>`}
      <div class="sa-kept"><ul>
        <li><span>${V14.KEPT_NET}</span><span>${money(income)}</span></li>
        <li><span>${V14.KEPT_EXPENSES}</span><span>${money(-(o.expenses?.total ?? 0))}</span></li>
        <li class="total"><span>${V14.KEPT_TOTAL}</span><span>${money(k?.kept ?? income)}</span></li></ul></div>
      <div class="meta" style="margin-top:8px">${V14.KEPT_NOTE}</div>
    </section>
  </div>`;
}

export function mount(ctx, root) {
  root.querySelectorAll("[data-goal]").forEach(b => b.addEventListener("click", () => openGoal(ctx)));
  root.querySelector("[data-entry-new]")?.addEventListener("click", () => openEntry(ctx));
}

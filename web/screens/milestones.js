// Kit 21: every badge for the open account, earned or not, as of its latest month. An earned tile shows
// only its date (decision #59); a locked one shows how far along it is.
import { V14, YOURS } from "../lib/copy.js";
import { cur, dateLong, esc, icon } from "../lib/format.js";
import { emptyScreen } from "../lib/parts.js";
import { art, badgeDesc, badgeName, latest, pose } from "../lib/rewards.js";

function progressText(b, money) {
  const p = b.progress;
  if (!p) return "";
  if (b.id === "growth_streak_3") return V14.PROGRESS_MONTHS.replace("{current}", p.current).replace("{target}", p.target);
  if (b.id === "five_sources") return V14.PROGRESS_SOURCES.replace("{current}", p.current).replace("{target}", p.target);
  const fmt = v => (p.unit && p.unit.length === 3 ? cur(v, p.unit) : String(v));
  return V14.PROGRESS_AMOUNT.replace("{current}", fmt(p.current)).replace("{target}", fmt(p.target));
}

export async function render(ctx) {
  if (!ctx.has) return emptyScreen(ctx, V14.MILESTONES_TITLE, YOURS.EMPTY_OVERVIEW);
  const month = ctx.latestMonth;
  const o = await ctx.load("overview", { month });
  const badges = o.badges ?? [];
  ctx.noteBadges(badges);
  const earned = badges.filter(b => b.earned), b0 = latest(badges);
  return `<div class="sa-top"><div><h1>${V14.MILESTONES_TITLE}</h1></div><div class="right">${ctx.whoPill(ctx)}</div></div>
  <div class="sa-grid">
    <section class="sa-hero c12 milestones-hero">
      <div class="orb"></div>
      ${pose(b0?.id ?? "five_sources", "hero-mascot")}
      <div class="lead">${b0 ? `${V14.LATEST_BADGE} · ${dateLong(b0.earned_on)}` : V14.NO_BADGE_YET}</div>
      <div class="sa-fig num">${V14.MILESTONES_EARNED.replace("{n}", earned.length).replace("{total}", badges.length)}</div>
      ${b0 ? `<div class="sub">${esc(badgeName(b0))}</div>` : ""}
    </section>
    ${ctx.cur === "CNY" ? `<div class="c12 sa-note info">${icon("info", "sm")}<span>${V14.USD_NOTE}</span></div>` : ""}
    <div class="c12 sa-badgegrid">${badges.map(b => `<div class="sa-badgetile ${b.earned ? "" : "locked"} ${b === b0 ? "latest" : ""}">
      ${b.earned ? "" : `<span class="lock">${icon("lock", "sm")}</span>`}
      <div class="art"><img src="${art(b.id)}" alt=""></div>
      <b>${esc(badgeName(b))}</b><span class="d">${esc(badgeDesc(b))}</span>
      ${b.earned ? `<div class="why">${V14.EARNED_ON.replace("{date}", dateLong(b.earned_on))}</div>`
        : `<div class="why">${progressText(b, ctx.money)}${b.progress ? `<div class="sa-progress"><i style="width:${Math.min(100, b.progress.current / b.progress.target * 100).toFixed(1)}%"></i></div>` : ""}</div>`}
    </div>`).join("")}</div>
  </div>`;
}

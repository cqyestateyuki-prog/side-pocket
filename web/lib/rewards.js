// The goal card and the badges (kit 20, 21, 22b), shared by Overview and Milestones. The numbers come
// from the server (daoshou/rewards.py); this file only draws them.
import { V14 } from "./copy.js";
import { cur, dateShort, esc, icon, localDay, monthName, pct } from "./format.js";

// Each badge's Tilly pose (decision #55); "goal" is the reached-goal state.
export const BADGE_ART = { first_1k_month: "coin", best_month: "trophy", growth_streak_3: "coin-stack", new_source: "envelope",
  five_sources: "star-badge", new_currency: "globe", total_10k: "medal", complete_month: "ledger", goal: "flag" };
export const art = id => `assets/mascot/badges/${BADGE_ART[id] ?? "star-badge"}.png`;
// A badge pose as a mascot image (shown once loaded, like lib/mascot.js).
export const pose = (id, cls = "") => `<img class="sa-mascot ${cls}" src="${art(id)}" alt="" aria-hidden="true" draggable="false"
  onload="this.classList.add('ok')" onerror="this.remove()">`;
export const badgeName = b => V14[`B_${b.id}_NAME`] ?? b.id;
export const badgeDesc = b => V14[`B_${b.id}_DESC`] ?? "";

export const latest = badges => [...(badges ?? [])].filter(b => b.earned && b.earned_on)
  .sort((a, b) => b.earned_on.localeCompare(a.earned_on))[0] ?? null;

const whole = (v, c) => cur(v, c).replace(/\.00$/, "");
const lastDay = m => `${m}-${String(new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate()).padStart(2, "0")}`;

// The monthly goal for the month on screen (the last month of a quarter): empty, in progress, ended short, reached.
export function goalCard(goal) {
  const change = `<button type="button" class="linkbtn" data-goal>${V14.CHANGE_GOAL}</button>`;
  if (!goal?.months?.length) {
    return `<section class="sa-card sa-goal empty"><div class="top"><div class="label">${icon("target", "sm")} ${V14.GOAL_EMPTY_TITLE}</div></div>
      <p class="meta">${V14.GOAL_EMPTY_BODY}</p><button type="button" class="sa-btn secondary sm" data-goal>${icon("target", "sm")} ${V14.SET_GOAL}</button></section>`;
  }
  const g = goal.months.at(-1), c = goal.currency, month = monthName(g.month);
  if (g.reached) {
    const over = Math.round((g.income - goal.amount) * 100) / 100;
    return `<section class="sa-card sa-goal reached"><div>
        <div class="label">${icon("target", "sm")} ${V14.GOAL_REACHED_LABEL.replace("{month}", month).replace("{date}", dateShort(g.reached_on))}</div>
        <h3>${V14.GOAL_REACHED_TITLE.replace("{month}", month)}</h3>
        <p>${V14.GOAL_REACHED_BODY.replace("{net}", `<b class="num">${cur(g.income, c)}</b>`).replace("{goal}", whole(goal.amount, c))}</p>
        <div class="sa-progress"><i style="width:100%"></i></div>
        <div class="note"><span class="num">${V14.GOAL_REACHED_NOTE.replace("{over}", cur(over, c)).replace("{goal}", whole(goal.amount, c))}</span>${change}</div></div>
      ${pose("goal")}</section>`;
  }
  const ended = lastDay(g.month) < localDay();
  const left = `<b class="num">${cur(g.remaining, c)}</b>`;
  return `<section class="sa-card sa-goal"><div class="top"><div class="label">${icon("target", "sm")} ${V14.GOAL_LABEL.replace("{month}", month)}</div><span class="sa-badge sim num">${pct(g.progress)}</span></div>
      <div class="fig num">${cur(g.income, c)}<small>of ${whole(goal.amount, c)}</small></div>
      <div class="sa-progress"><i style="width:${Math.min(100, g.progress * 100).toFixed(1)}%"></i></div>
      <div class="note"><span>${(ended ? V14.GOAL_SHORT : V14.GOAL_TO_GO).replace("{left}", left).replace("{goal}", whole(goal.amount, c))}</span>${change}</div></section>`;
}

// The newest earned badge, one row, linking to Milestones.
export function latestCard(badges, href) {
  const b = latest(badges);
  if (!b) return `<a class="sa-card sa-latest" href="${href}">${pose("five_sources")}<div><div class="label">${V14.LATEST_BADGE}</div><b>${V14.NO_BADGE_YET}</b></div><span class="go">${V14.SEE_ALL} ${icon("chevron", "sm rot")}</span></a>`;
  return `<a class="sa-card sa-latest" href="${href}">${pose(b.id)}
    <div><div class="label">${V14.LATEST_BADGE} · ${dateShort(b.earned_on)}</div><b>${esc(badgeName(b))}</b></div><span class="go">${V14.SEE_ALL} ${icon("chevron", "sm rot")}</span></a>`;
}

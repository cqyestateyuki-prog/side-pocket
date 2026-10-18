// Kit 22: the monthly income goal. One amount in the display currency, quick amounts, and how the last
// three months would have done against it. Saved in this browser for the open account (lib/entries.js).
import { V14 } from "./copy.js";
import { cur, esc, icon, monthName, pct, quarterOf } from "./format.js";
import { current, saveGoal } from "./entries.js";

const QUICK = { USD: [4000, 5000, 6000, 7000], CNY: [30000, 40000, 50000, 60000] };
const whole = (v, c) => cur(v, c).replace(/\.00$/, "");

function months(list, amount, c) {
  if (!list.length) return "";
  return `<section class="sa-card goal-months">
    <div class="label">${amount > 0 ? V14.LAST_MONTHS.replace("{n}", list.length).replace("{goal}", whole(amount, c)) : V14.LAST_MONTHS.replace("{n}", list.length).replace(/\s*·.*$/, "")}</div>
    <ul class="sa-catbars">${list.map(m => {
      const p = amount > 0 ? m.income / amount : 0;
      return `<li><span>${monthName(m.month)}</span><span class="amt">${cur(m.income, c)} ${amount > 0 ? (p >= 1
        ? `<span class="sa-badge ok">${icon("check", "sm")} ${V14.REACHED}</span>` : `<span class="sa-badge sim">${pct(p)}</span>`) : ""}</span>
        <span class="track"><i style="width:${Math.min(100, p * 100).toFixed(1)}%;background:var(--sa-forest)"></i></span></li>`;
    }).join("")}</ul></section>`;
}

export async function openGoal(ctx) {
  const c = ctx.cur ?? "USD";
  const { goal } = await current(ctx);
  const start = goal && goal.currency === c ? goal.amount : "";
  const month = ctx.latestMonth ?? (ctx.period && !ctx.period.includes("Q") ? ctx.period : null);
  let list = [];
  try {
    if (!month) throw new Error("no month");
    const r = await ctx.load("report", { period: quarterOf(month) });
    list = (r.kept_by_month ?? []).filter(m => m.month <= month).map(m => ({ month: m.month, income: m.income ?? m.platform_net + m.manual_income }));
  } catch { /* the months card is a help, not a must */ }

  const wrap = document.createElement("div");
  wrap.className = "sa-drawer-wrap";
  wrap.innerHTML = `<div class="sa-drawer-backdrop" data-close></div>
  <aside class="sa-drawer goal-sheet" role="dialog" aria-modal="true" aria-label="${V14.GOAL_SHEET_TITLE}">
    <div class="head"><div><h2>${V14.GOAL_SHEET_TITLE}</h2><p>${V14.GOAL_SHEET_SUB}</p></div>
      <button type="button" class="sa-btn secondary sm" data-close>Close</button></div>
    <label class="sa-field"><span class="label">${V14.GOAL_FIELD}</span>
      <span class="ctl big"><span class="pre">${esc(cur(0, c).replace(/[\d.,]/g, "").trim())}</span><input name="goal" inputmode="decimal" autocomplete="off" placeholder="${QUICK[c][2].toLocaleString("en-US")}" value="${start === "" ? "" : esc(String(start))}"><span class="end">${V14.GOAL_FIELD_END}</span></span></label>
    <div class="sa-seg wide quick">${QUICK[c].map(v => `<button type="button" data-quick="${v}" class="${v === +start ? "on" : ""}">${whole(v, c)}</button>`).join("")}</div>
    <div data-months>${months(list, +start || 0, c)}</div>
    <p class="sa-form-err" data-err role="alert" hidden></p>
    <div class="foot">
      <button type="button" class="sa-btn primary" data-save>${icon("target", "sm")} ${V14.SAVE_GOAL}</button>
      ${goal ? `<button type="button" class="sa-btn danger" data-remove>${V14.REMOVE_GOAL}</button>` : ""}
      <button type="button" class="sa-btn ghost" data-close>Cancel</button>
    </div>
  </aside>`;
  document.body.append(wrap);
  const $ = sel => wrap.querySelector(sel);
  const input = $("input[name=goal]");
  const onKey = ev => { if (ev.key === "Escape") close(); };
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  const value = () => Number(input.value.replace(/[,\s]/g, ""));
  const update = () => {
    const v = value();
    $("[data-months]").innerHTML = months(list, v > 0 ? v : 0, c);
    wrap.querySelectorAll("[data-quick]").forEach(b => b.classList.toggle("on", +b.dataset.quick === v));
  };
  document.addEventListener("keydown", onKey);
  wrap.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", close));
  wrap.querySelectorAll("[data-quick]").forEach(b => b.addEventListener("click", () => { input.value = b.dataset.quick; update(); }));
  input.addEventListener("input", update);
  setTimeout(() => input.focus(), 0);
  $("[data-save]").addEventListener("click", async () => {
    const v = value();
    if (!(v > 0) || v > 10_000_000 || !/^\d+(\.\d{1,2})?$/.test(input.value.replace(/[,\s]/g, ""))) {
      const p = $("[data-err]"); p.textContent = V14.ERR_AMOUNT; p.hidden = false; return;
    }
    await saveGoal(ctx, { amount: v, currency: c });
    close();
    ctx.refresh();
  });
  $("[data-remove]")?.addEventListener("click", async () => { await saveGoal(ctx, null); close(); ctx.refresh(); });
}

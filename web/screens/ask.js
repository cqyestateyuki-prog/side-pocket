// Ask: the v2 agent answers live. Each step streams in from POST /api/ask; the answer's
// numbers point back to the step that produced them. #ask?replay=1 replays a recorded real run
// (web/demo/ask-c01-sep.json) for offline demos and static captures.
// In Your data mode the question goes to POST /api/personal/ask with the stored (relabelled) files;
// that agent's tools return totals only and its PRISM trace is content-free.
import { ask } from "../lib/api.js";
import { ask as askYours } from "../lib/personal.js";
import { COPY, YOURS } from "../lib/copy.js";
import { PLATFORM_KEY, cur, dateLong, esc, icon, monthName, picon, usd } from "../lib/format.js";
import { mascot } from "../lib/mascot.js";
import { english } from "../lib/display.js";
import { emptyScreen } from "../lib/parts.js";

const LABEL = { bilibili: "Bilibili", youtube: "YouTube", twitch: "Twitch", patreon: "Patreon", upwork: "Upwork", fiverr: "Fiverr", freelancer: "Freelancer.com", contra: "Contra" };
// UI labels. The UI is English-only (user decision); a language switch is deferred.
const T = {
  en: {
    examples: ["How much did I actually make in September, across every platform?", "Who took my money in Q3: platform fees or tax?", "What tax items do I have this quarter?"],
    placeholder: COPY.ASK_PLACEHOLDER, promise: COPY.ASK_PROMISE, button: "Ask", tryAsking: "Try asking", answer: "Answer",
    steps: "Agent steps", calls: n => `${n} tool calls`, running: "running", choosing: "The agent is choosing its next step…",
    stepsEmpty: "Each lookup and calculation shows up here as the agent works, and is traced in PRISM.",
    thinking: "Atlas is working through the steps…", replay: "Replay of a real traced run",
    lines: ["Gross income", "Platform fees", "Payout & payment fees", "Tax withheld by platforms", "Net (what landed)"],
    setAside: r => `Set aside at your ${r}%`, nextDue: "Next US estimated tax", where: m => `Where ${monthName(m)}’s gross went`,
    fees: "Platform fees by platform",
  },
};
const REPLAY = "demo/ask-c01-sep.json";
const t = () => T.en;
const PRISM_SESSIONS = "https://prism.blockconvey.com/sessions";

let run = null;      // { question, creator, mode, steps, answer, done, error, offline, replay }
let root = null, ctxRef = null;

// Your data's tools name amounts by display currency (net_usd, net_cny); the demo's are plain or USD.
const k = () => (run?.currency ?? "USD").toLowerCase();
const amt = (r, f) => r?.[`${f}_${k()}`] ?? r?.[f];
const money = v => cur(v, run?.currency ?? "USD");
const examples = () => ctxRef?.yours ? [YOURS.ASK_EXAMPLE_1, YOURS.ASK_EXAMPLE_2, YOURS.ASK_EXAMPLE_3] : t().examples;

// ---------------------------------------------------------------- step text

function argsText(name, a = {}) {
  if (name === "find_creator") return a.name ?? a.creator_id ?? "";
  if (name === "load_platform") return `${LABEL[a.platform] ?? a.platform} · ${a.month ?? ""}`;
  if (name === "submit_answer") return `${a.answer ?? "null"} ${a.unit ?? ""}`;
  return [a.creator_id, a.month ?? a.period ?? a.later_month, a.contract_id, a.platform && (LABEL[a.platform] ?? a.platform)].filter(Boolean).join(" · ");
}

function resultText(s) {
  if (s.status === "error") return s.error ?? "failed";
  const r = s.result;
  if (!r || typeof r !== "object") return (s.result_summary ?? "").slice(0, 120);
  switch (s.name) {
    case "find_creator": return `${r.creator_id} · ${Object.keys(r.accounts ?? {}).length} platforms · ${r.tax_country} tax home · set-aside ${Math.round((r.set_aside_rate ?? 0) * 100)}%`;
    case "load_platform": return `${r.records} record${r.records === 1 ? "" : "s"} · ${(r.currencies ?? []).join(", ")}${r.has_withheld_tax ? " · tax withheld" : ""}`;
    case "convert_currency": return `${r.non_usd_records} non-USD record${r.non_usd_records === 1 ? "" : "s"} converted at their own dates’ rates`;
    case "get_summary": return `${(r.platforms ?? []).length} platforms · ${(r.months ?? []).length} months · ${r.tax_home} tax home`;
    case "compute_breakdown": return r.total ? `gross ${money(amt(r.total, "gross"))} → net ${money(amt(r.total, "net"))}` : "breakdown computed";
    case "compare_months": return `${r.later_month} vs ${r.earlier_month}: ${money(amt(r, "change"))}`;
    case "compute_set_aside": return `set aside ${usd(r.set_aside_usd)} at ${Math.round(r.set_aside_rate * 100)}%`;
    case "tax_items": return `set aside ${money(amt(r, "set_aside"))}${r.next_us_estimated_tax_due ? ` · next due ${r.next_us_estimated_tax_due.due_date ?? "—"}` : ""}`;
    case "form_check": return `${(r.platforms ?? []).length} platforms checked${r.possible_duplicate_reports?.length ? ` · possible duplicate: ${r.possible_duplicate_reports.join(", ")}` : ""}`;
    case "submit_answer": return "recorded";
    default: return (s.result_summary ?? "").slice(0, 120);
  }
}

// ---------------------------------------------------------------- linking numbers to steps

const toolSteps = () => (run?.steps ?? []).filter(s => s.type === "tool");

function containsNumber(obj, n) {
  if (typeof obj === "number") return Math.abs(obj - n) < 0.005;
  if (obj && typeof obj === "object") return Object.values(obj).some(v => containsNumber(v, n));
  return false;
}

function refFor(value) {
  const steps = toolSteps();
  const n = typeof value === "number" ? value : parseFloat(value);
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].name !== "submit_answer" && !Number.isNaN(n) && containsNumber(steps[i].result, n)) return i + 1;
  }
  return steps.findIndex(s => s.name === "submit_answer") + 1 || null;
}

// The breakdown the answer is about: the latest month the agent broke down.
function breakdownIndex() {
  const steps = toolSteps();
  let best = -1;
  steps.forEach((s, i) => {
    if (s.name !== "compute_breakdown" || !s.result?.total) return;
    if (best < 0 || String(s.args?.month ?? "") >= String(steps[best].args?.month ?? "")) best = i;
  });
  return best;
}

function feeChips() {
  const bi = breakdownIndex();
  const plats = bi >= 0 ? toolSteps()[bi].result.platforms : null;
  if (!plats || typeof plats !== "object") return "";
  const rows = Object.entries(plats).map(([p, v]) => [p, v?.usd?.platform_fee ?? amt(v, "platform_fee")]).filter(([, f]) => Number(f) > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return "";
  return `<div class="label" style="margin-top:14px">${t().fees}</div><div class="sa-platchips">${rows.map(([p, f]) =>
    `<span class="sa-chip">${picon(PLATFORM_KEY[p] ?? p)}${esc(LABEL[p] ?? p)} <span class="num">${money(Number(f))}</span></span>`).join("")}</div>`;
}

function lines() {
  const steps = toolSteps();
  const out = [];
  const bi = breakdownIndex();
  if (bi >= 0) {
    const tot = steps[bi].result.total;
    const L = t().lines;
    out.push([L[0], amt(tot, "gross"), bi + 1], [L[1], -amt(tot, "platform_fee"), bi + 1],
             [L[2], -(amt(tot, "payment_fee") ?? amt(tot, "payout_fee")), bi + 1], [L[3], -amt(tot, "withheld"), bi + 1], [L[4], amt(tot, "net"), bi + 1]);
  }
  const si = steps.findLastIndex(s => (s.name === "compute_set_aside" || s.name === "tax_items") && s.result);
  if (si >= 0) {
    const r = steps[si].result;
    out.push([t().setAside(Math.round(r.set_aside_rate * 100)), amt(r, "set_aside") ?? r.set_aside_usd, si + 1]);
    if (r.next_us_estimated_tax_due?.due_date) out.push([t().nextDue, dateLong(r.next_us_estimated_tax_due.due_date), si + 1]);
  }
  return out;
}

// The agent's reply, lightly formatted: **bold** kept, the first two paragraphs, one line.
function prose(text) {
  if (!text) return "";
  // Markdown tables repeat the lines below the answer, so they are left out of the summary.
  return text.split("\n").filter(l => !l.trim().startsWith("|")).join("\n").split(/\n\s*\n/).filter(p => p.trim()).slice(0, 2).join(" ").replace(/^#+\s*/gm, "").replace(/\n/g, " ")
    .split(/(\*\*[^*]+\*\*)/).map(part => part.startsWith("**") ? `<b>${esc(part.slice(2, -2))}</b>` : esc(part.replace(/[*_`]/g, ""))).join("");
}

function figure(a) {
  if (a.answer == null) return null;
  if (a.unit === "USD") return usd(Number(a.answer));
  if (a.unit === "CNY") return cur(Number(a.answer), "CNY");
  if (a.unit === "date") return dateLong(String(a.answer).slice(0, 10));
  return esc(String(a.answer));
}

// ---------------------------------------------------------------- view

// An outline icon per tool, so the steps read at a glance.
const TOOL_ICON = { find_creator: "search", get_summary: "overview", load_platform: "file", convert_currency: "fx", compute_breakdown: "coins",
  compare_months: "up", compute_set_aside: "sliders", simulate_patreon_ios: "monitor", get_upwork_contract_fees: "percent", get_fee_details: "percent",
  tax_items: "tax", form_check: "duplicate", get_manual_income: "pencil", get_expenses: "wallet", get_goal_progress: "target", submit_answer: "send" };

function stepsCard() {
  const steps = toolSteps();
  const running = run && !run.done;
  const emptySteps = `<div class="steps-empty">${mascot("ledger", "steps-mascot")}<div>${t().stepsEmpty}</div></div>`;
  if (run?.offline) return `<section class="sa-card c5 steps-card"><div class="head"><h2>${t().steps}</h2></div>${emptySteps}</section>`;
  const badge = !run ? "" : running ? `<span class="sa-badge sim"><i class="spin"></i> ${t().running}</span>` : `<span class="sa-badge ok">${t().calls(steps.length)}</span>`;
  const groups = [];
  steps.forEach((s, i) => {
    const g = groups.at(-1);
    const same = g && g.name === s.name && ["load_platform", "convert_currency"].includes(s.name) && s.status !== "error" && g.last.status !== "error";
    if (same) { g.to = i + 1; g.items.push(s); g.last = s; } else groups.push({ name: s.name, from: i + 1, to: i + 1, items: [s], last: s });
  });
  const items = groups.map(g => {
    const s = g.items[0];
    const many = g.items.length > 1;
    const args = many ? [...new Set(g.items.map(x => argsText(x.name, x.args).split(" · ")[0]))].join(" · ") : argsText(s.name, s.args);
    const res = many ? (s.name === "load_platform" ? `${g.items.reduce((n, x) => n + (x.result?.records ?? 0), 0)} records across ${g.items.length} loads` : `${g.items.length} conversions`) : resultText(s);
    return `<li data-from="${g.from}" data-to="${g.to}" class="${s.status === "error" ? "err" : ""} ${s.name === "submit_answer" ? "final" : ""}">
      <span class="n ${many ? "range" : ""}">${many ? `${g.from}–${g.to}` : g.from}</span>
      <div><div class="t">${icon(TOOL_ICON[s.name] ?? "steps", "sm tool")}${esc(s.name)}${many ? ` ×${g.items.length}` : ""}${args ? `<span class="args"> · ${esc(args)}</span>` : ""}</div><div class="s">${esc(res)}</div></div>
      ${s.status === "error" ? icon("alert", "sm warnicon") : icon("check", "sm")}</li>`;
  }).join("");
  const pending = running ? `<li class="pending"><span class="n"><i class="spin"></i></span><div><div class="s">${t().choosing}</div></div></li>` : "";
  return `<section class="sa-card c5 steps-card">
    <div class="head"><h2>${t().steps}</h2>${badge}</div>
    ${run ? `<ol class="sa-steps">${items}${pending}</ol>` : emptySteps}
  </section>`;
}

function answerBlock() {
  if (!run) {
    return `<section class="sa-card sage examples">${mascot("laptop", "ex-mascot")}<div class="label">${t().tryAsking}</div>
      <div class="example-list">${examples().map(q => `<button class="sa-chip" data-example="${esc(q)}">${esc(q)}</button>`).join("")}</div></section>`;
  }
  const a = run.answer;
  const bubble = `<div class="sa-bubble">${esc(run.question)}</div>`;
  if (run.offline) return bubble + `<section class="sa-emptycard">${mascot("think")}<div><b>${YOURS.ASK_OFF_TITLE}</b><p>${esc(run.offline)}</p></div></section>`;
  if (run.error) return bubble + `<section class="sa-warncard">${icon("alert")}<div class="wc-body"><h2>The run didn’t finish.</h2><p>${esc(run.error)}</p></div></section>`;
  if (!a) return bubble + `<section class="sa-card thinking">${mascot("laptop", "think-mascot")}<div class="meta">${t().thinking}</div></section>`;
  const fig = figure(a);
  const toolErr = toolSteps().find(s => s.status === "error");
  if (fig == null) {
    return bubble + `<section class="sa-warncard">
      <div class="wc-icon">${icon("alert")}</div>
      <div class="wc-body"><div class="label">Stopped · no number given</div><h2>${COPY.MISSING_HEADLINE}</h2>
        <p>${esc(a.explanation || a.text || COPY.MISSING_BODY)}</p>
        ${toolErr ? `<p class="mono err">Step ${toolSteps().indexOf(toolErr) + 1} · ${esc(toolErr.name)}: ${esc(toolErr.error)}</p>` : ""}</div></section>` + footer();
  }
  const ls = lines();
  return bubble + `
    <section class="sa-hero sa-answer">
      ${mascot("envelope", "answer-mascot")}
      <div class="lead">${t().answer}</div>
      <div class="sa-fig num">${fig}${refFor(a.answer) ? `<a class="sa-ref" href="#step-${refFor(a.answer)}">${refFor(a.answer)}</a>` : ""}</div>
      <div class="sub clamp">${prose(a.text) || esc(a.explanation ?? "")}</div>
    </section>
    ${ls.length ? `<section class="sa-card answer-lines">${breakdownIndex() >= 0 && toolSteps()[breakdownIndex()].args?.month ? `<div class="head" style="margin-bottom:4px"><h2>${t().where(toolSteps()[breakdownIndex()].args.month)}</h2></div>` : ""}<ul class="sa-lines">${ls.map(([l, v, s]) => `<li><span>${l}</span><span class="amt">${typeof v === "number" ? money(v) : esc(v)}<span class="sa-ref light">${s}</span></span></li>`).join("")}</ul>${feeChips()}${footer()}</section>` : `<section class="sa-card answer-lines">${footer()}</section>`}`;
}

function footer() {
  if (!run?.done) return "";
  const d = run.done;
  return `<div class="answer-foot">
    <span class="promise">${icon("check", "sm")} ${t().promise}</span>
    ${d.session_id ? `<a class="sa-prism" href="${PRISM_SESSIONS}" target="_blank" rel="noopener" title="trace ${esc(d.trace_id ?? "")}"><i></i>${d.content_free ? "Content-free trace in PRISM" : "Traced in PRISM"} · ${esc(d.session_id)} ${icon("external", "sm")}</a>` : ""}
  </div>`;
}

function view(ctx) {
  const busy = run && !run.done;
  return `<div class="sa-top"><div><h1 class="with-av"><img class="sa-avatar" src="assets/logo/icon-96.png" alt="" width="44" height="44">Ask Atlas</h1><p>The agent looks things up step by step; code does the math.</p></div>
    <div class="right">${run?.replay ? `<span class="sa-badge sim">${t().replay}</span>` : ""}${ctx.whoPill(ctx)}</div></div>
  <div class="sa-grid">
    <div class="c7 stack ask-col">
      ${answerBlock()}
      <form class="sa-input" data-ask>
        <input name="q" placeholder="${esc(t().placeholder)}" autocomplete="off" ${busy ? "disabled" : ""} value="${esc(busy ? "" : (ctx.query.get("q") ?? ""))}">
        <button class="sa-btn primary sm" ${busy ? "disabled" : ""}>${icon("send", "sm")} ${t().button}</button>
      </form>
    </div>
    ${stepsCard()}
  </div>`;
}

function paint() {
  if (!root || !ctxRef || !root.isConnected || !location.hash.startsWith("#ask")) return;
  root.innerHTML = view(ctxRef);
  bind();
}

function onEvent(name, data) {
  if (!run) return;
  if (name === "step") run.steps.push(data);
  else if (name === "answer") run.answer = data;
  else if (name === "error") run.error = data.message;
  else if (name === "done") {
    run.done = data;
    // The public deployment has no model key, so the server streams a recorded real run.
    if (data.replay) { run.replay = true; if (data.recorded_question) run.question = data.recorded_question; }
  }
  paint();
}

async function start(question, ctx) {
  run = { question, creator: ctx.creator, mode: ctx.mode, currency: ctx.cur, steps: [], answer: null, done: null, error: null };
  paint();
  try {
    if (ctx.yours) await askYours(question, ctx.data, onEvent);
    else await ask(question, ctx.creator, onEvent);
    if (!run.done) run.done = { failed: true };
  } catch (e) {
    // The public deployment has no model key: say so plainly instead of replaying a demo answer.
    if (ctx.yours && e.status === 503) run.offline = e.message;
    else run.error = e.message;
    run.done = { failed: true };
  }
  paint();
}

async function replay() {
  const rec = english(await (await fetch(REPLAY)).json());
  run = { question: rec.question, creator: rec.creator, mode: "demo", currency: "USD", steps: [], answer: null, done: null, error: null, replay: true };
  paint();
  for (const [name, data] of rec.events) {
    await new Promise(r => setTimeout(r, 140));
    onEvent(name, data);
  }
}

function bind() {
  root.querySelector("[data-ask]")?.addEventListener("submit", ev => {
    ev.preventDefault();
    const q = new FormData(ev.target).get("q")?.toString().trim();
    if (q && !(run && !run.done)) start(q, ctxRef);
  });
  root.querySelectorAll("[data-example]").forEach(b => b.addEventListener("click", () => start(b.dataset.example, ctxRef)));
  root.querySelectorAll(".sa-ref[href^='#step-']").forEach(a => a.addEventListener("click", ev => {
    ev.preventDefault();
    const n = +a.getAttribute("href").slice(6);
    const li = [...root.querySelectorAll(".sa-steps li[data-from]")].find(x => +x.dataset.from <= n && n <= +x.dataset.to);
    li?.scrollIntoView({ block: "center", behavior: "smooth" });
    li?.classList.add("flash");
    setTimeout(() => li?.classList.remove("flash"), 1200);
  }));
}

export async function render(ctx) {
  if (ctx.yours && !ctx.has) return emptyScreen(ctx, "Ask Atlas", YOURS.EMPTY_ASK);
  if (run && run.mode !== ctx.mode) run = null; // a run belongs to the ledger it was asked about
  ctxRef = ctx;
  return view(ctx);
}

export function mount(ctx, el) {
  root = el;
  ctxRef = ctx;
  bind();
  if (ctx.query.get("replay") && !run?.replay && !ctx.yours) replay();
  else if (ctx.query.get("go") && ctx.query.get("q") && !run) start(ctx.query.get("q"), ctx);
}

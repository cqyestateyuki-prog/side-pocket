// Ask: the v2 agent answers live. Each step streams in from POST /api/ask; the answer's
// numbers point back to the step that produced them. #ask?replay=1 replays a recorded real run
// (web/demo/ask-c01-sep.json) for offline demos and static captures.
import { ask } from "../lib/api.js";
import { COPY } from "../lib/copy.js";
import { cur, dateLong, esc, icon, usd } from "../lib/format.js";

const LABEL = { bilibili: "B站", youtube: "YouTube", twitch: "Twitch", patreon: "Patreon", upwork: "Upwork", fiverr: "Fiverr", freelancer: "Freelancer.com", contra: "Contra" };
const EXAMPLES = [
  "How much did I actually make in September, across every platform?",
  "Who took my money in Q3 — platform fees or tax?",
  "What tax items do I have this quarter?",
  "月之灵 9 月到手多少美元？",
];
const PRISM_SESSIONS = "https://prism.blockconvey.com/sessions";

let run = null;      // { question, creator, steps, answer, done, error, replay }
let root = null, ctxRef = null;

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
    case "compute_breakdown": return r.total ? `gross ${usd(r.total.gross)} → net ${usd(r.total.net)}` : "breakdown computed";
    case "compute_set_aside": return `set aside ${usd(r.set_aside_usd)} at ${Math.round(r.set_aside_rate * 100)}%`;
    case "tax_items": return `set aside ${usd(r.set_aside_usd)} · next due ${r.next_us_estimated_tax_due?.due_date ?? "—"}`;
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

function lines() {
  const steps = toolSteps();
  const out = [];
  const bi = steps.findLastIndex(s => s.name === "compute_breakdown" && s.result?.total);
  if (bi >= 0) {
    const t = steps[bi].result.total;
    out.push(["Gross income", t.gross, bi + 1], ["Platform fees", -t.platform_fee, bi + 1],
             ["Payout & payment fees", -t.payment_fee, bi + 1], ["Tax withheld by platforms", -t.withheld, bi + 1], ["Net — what landed", t.net, bi + 1]);
  }
  const si = steps.findLastIndex(s => (s.name === "compute_set_aside" || s.name === "tax_items") && s.result);
  if (si >= 0) {
    const r = steps[si].result;
    out.push([`Set aside at your ${Math.round(r.set_aside_rate * 100)}%`, r.set_aside_usd, si + 1]);
    if (r.next_us_estimated_tax_due?.due_date) out.push(["Next US estimated tax", dateLong(r.next_us_estimated_tax_due.due_date), si + 1]);
  }
  return out;
}

// The agent's reply, lightly formatted: **bold** kept, the first two paragraphs, one line.
function prose(text) {
  if (!text) return "";
  return text.split(/\n\s*\n/).slice(0, 2).join(" ").replace(/^#+\s*/gm, "").replace(/\n/g, " ")
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

function stepsCard() {
  const steps = toolSteps();
  const running = run && !run.done;
  const badge = !run ? "" : running ? `<span class="sa-badge sim"><i class="spin"></i> running</span>` : `<span class="sa-badge ok">${steps.length} tool calls</span>`;
  const items = steps.map((s, i) => `<li class="${s.status === "error" ? "err" : ""} ${s.name === "submit_answer" ? "final" : ""}">
      <span class="n">${i + 1}</span>
      <div><div class="t">${esc(s.name)}<span class="args"> · ${esc(argsText(s.name, s.args))}</span></div><div class="s">${esc(resultText(s))}</div></div>
      ${s.status === "error" ? icon("alert", "sm warnicon") : icon("check", "sm")}</li>`).join("");
  const pending = running ? `<li class="pending"><span class="n"><i class="spin"></i></span><div><div class="s">The agent is choosing its next step…</div></div></li>` : "";
  return `<section class="sa-card c5 steps-card">
    <div class="head"><h2>Agent steps</h2>${badge}</div>
    ${run ? `<ol class="sa-steps">${items}${pending}</ol>` : `<div class="steps-empty">${icon("steps")}<div>Each lookup and calculation shows up here as the agent works, and is traced in PRISM.</div></div>`}
  </section>`;
}

function answerBlock() {
  if (!run) {
    return `<section class="sa-card sage examples"><div class="label">Try asking</div>
      <div class="example-list">${EXAMPLES.map(q => `<button class="sa-chip" data-example="${esc(q)}">${esc(q)}</button>`).join("")}</div></section>`;
  }
  const a = run.answer;
  const bubble = `<div class="sa-bubble">${esc(run.question)}</div>`;
  if (run.error) return bubble + `<section class="sa-warncard">${icon("alert")}<div class="wc-body"><h2>The run didn’t finish.</h2><p>${esc(run.error)}</p></div></section>`;
  if (!a) return bubble;
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
      <div class="lead">Answer</div>
      <div class="sa-fig num">${fig}${refFor(a.answer) ? `<a class="sa-ref" href="#step-${refFor(a.answer)}">${refFor(a.answer)}</a>` : ""}</div>
      <div class="sub clamp">${prose(a.text) || esc(a.explanation ?? "")}</div>
    </section>
    ${ls.length ? `<section class="sa-card answer-lines"><ul class="sa-lines">${ls.map(([l, v, s]) => `<li><span>${l}</span><span class="amt">${typeof v === "number" ? usd(v) : esc(v)}<span class="sa-ref light">${s}</span></span></li>`).join("")}</ul>${footer()}</section>` : `<section class="sa-card answer-lines">${footer()}</section>`}`;
}

function footer() {
  if (!run?.done) return "";
  const d = run.done;
  return `<div class="answer-foot">
    <span class="promise">${icon("check", "sm")} ${COPY.ASK_PROMISE}</span>
    ${d.session_id ? `<a class="sa-prism" href="${PRISM_SESSIONS}" target="_blank" rel="noopener" title="trace ${esc(d.trace_id ?? "")}"><i></i>Traced in PRISM · ${esc(d.session_id)} ${icon("external", "sm")}</a>` : ""}
  </div>`;
}

function view(ctx) {
  const busy = run && !run.done;
  return `<div class="sa-top"><div><h1>Ask</h1><p>Questions in English or Chinese. The agent looks things up step by step; code does the math.</p></div>
    <div class="right">${run?.replay ? `<span class="sa-badge sim">Replay of a recorded run</span>` : ""}${ctx.whoPill(ctx)}</div></div>
  <div class="sa-grid">
    <div class="c7 stack ask-col">
      ${answerBlock()}
      <form class="sa-input" data-ask>
        <input name="q" placeholder="${esc(COPY.ASK_PLACEHOLDER)}" autocomplete="off" ${busy ? "disabled" : ""} value="${esc(busy ? "" : (ctx.query.get("q") ?? ""))}">
        <button class="sa-btn primary sm" ${busy ? "disabled" : ""}>${icon("send", "sm")} Ask</button>
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
  else if (name === "done") run.done = data;
  paint();
}

async function start(question, ctx) {
  run = { question, creator: ctx.creator, steps: [], answer: null, done: null, error: null };
  paint();
  try {
    await ask(question, ctx.creator, onEvent);
    if (!run.done) run.done = { failed: true };
  } catch (e) {
    run.error = e.message;
    run.done = { failed: true };
  }
  paint();
}

async function replay() {
  const rec = await (await fetch("demo/ask-c01-sep.json")).json();
  run = { question: rec.question, creator: rec.creator, steps: [], answer: null, done: null, error: null, replay: true };
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
    const li = root.querySelectorAll(".sa-steps li")[+a.getAttribute("href").slice(6) - 1];
    li?.scrollIntoView({ block: "center", behavior: "smooth" });
    li?.classList.add("flash");
    setTimeout(() => li?.classList.remove("flash"), 1200);
  }));
}

export async function render(ctx) {
  return view(ctx);
}

export function mount(ctx, el) {
  root = el;
  ctxRef = ctx;
  bind();
  if (ctx.query.get("replay") && !run?.replay) replay();
  else if (ctx.query.get("go") && ctx.query.get("q") && !run) start(ctx.query.get("q"), ctx);
}

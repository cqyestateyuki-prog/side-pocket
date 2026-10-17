// Ask: the v2 agent answers live. Each step streams in from POST /api/ask; the answer's
// numbers point back to the step that produced them. #ask?replay=1 replays a recorded real run
// (web/demo/ask-c01-sep.json) for offline demos and static captures.
import { ask } from "../lib/api.js";
import { COPY } from "../lib/copy.js";
import { PLATFORM_KEY, cur, dateLong, esc, icon, monthName, usd } from "../lib/format.js";
import { mascot } from "../lib/mascot.js";

const LABEL = { bilibili: "B站", youtube: "YouTube", twitch: "Twitch", patreon: "Patreon", upwork: "Upwork", fiverr: "Fiverr", freelancer: "Freelancer.com", contra: "Contra" };
// UI labels per language. The agent answers in the language of the question.
const T = {
  en: {
    examples: ["How much did I actually make in September, across every platform?", "Who took my money in Q3 — platform fees or tax?", "What tax items do I have this quarter?"],
    placeholder: COPY.ASK_PLACEHOLDER, promise: COPY.ASK_PROMISE, button: "Ask", tryAsking: "Try asking", answer: "Answer",
    steps: "Agent steps", calls: n => `${n} tool calls`, running: "running", choosing: "The agent is choosing its next step…",
    stepsEmpty: "Each lookup and calculation shows up here as the agent works, and is traced in PRISM.",
    thinking: "Atlas is working through the steps…", replay: "Replay of a recorded run",
    lines: ["Gross income", "Platform fees", "Payout & payment fees", "Tax withheld by platforms", "Net — what landed"],
    setAside: r => `Set aside at your ${r}%`, nextDue: "Next US estimated tax", where: m => `Where ${monthName(m)}’s gross went`,
    fees: "Platform fees by platform",
  },
  zh: {
    examples: [COPY.ASK_ZH_QUESTION, "月之灵 9 月到手多少美元？", "第三季度我该预留多少税？"],
    placeholder: COPY.ASK_ZH_PLACEHOLDER, promise: COPY.ASK_ZH_PROMISE, button: "提问", tryAsking: "试试这样问", answer: "回答",
    steps: "智能体步骤", calls: n => `${n} 次工具调用`, running: "运行中", choosing: "智能体正在选择下一步…",
    stepsEmpty: "每一次查询和计算都会在这里出现，并记录在 PRISM 里。",
    thinking: "Atlas 正在一步步计算…", replay: "回放一次真实运行",
    lines: ["毛收入", "平台抽成", "提现和支付费", "平台代扣税", "到手"],
    setAside: r => `按你的 ${r}% 预留`, nextDue: "下一次美国季度预缴", where: m => `${+m.slice(5)} 月钱被谁扣了`,
    fees: "各平台抽成",
  },
};
const REPLAYS = { en: "demo/ask-c01-sep.json", zh: "demo/ask-c01-zh.json" };
let lang = "en";
const t = () => T[lang];
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
  const rows = Object.entries(plats).map(([k, v]) => [k, v?.usd?.platform_fee ?? v?.platform_fee]).filter(([, f]) => Number(f) > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return "";
  return `<div class="label" style="margin-top:14px">${t().fees}</div><div class="sa-platchips">${rows.map(([k, f]) =>
    `<span class="sa-chip"><i class="dot" style="background:var(--sa-p-${PLATFORM_KEY[k] ?? k})"></i>${esc(LABEL[k] ?? k)} <span class="num">${usd(Number(f))}</span></span>`).join("")}</div>`;
}

function lines() {
  const steps = toolSteps();
  const out = [];
  const bi = breakdownIndex();
  if (bi >= 0) {
    const tot = steps[bi].result.total;
    const L = t().lines;
    out.push([L[0], tot.gross, bi + 1], [L[1], -tot.platform_fee, bi + 1],
             [L[2], -tot.payment_fee, bi + 1], [L[3], -tot.withheld, bi + 1], [L[4], tot.net, bi + 1]);
  }
  const si = steps.findLastIndex(s => (s.name === "compute_set_aside" || s.name === "tax_items") && s.result);
  if (si >= 0) {
    const r = steps[si].result;
    out.push([t().setAside(Math.round(r.set_aside_rate * 100)), r.set_aside_usd, si + 1]);
    if (r.next_us_estimated_tax_due?.due_date) out.push([t().nextDue, dateLong(r.next_us_estimated_tax_due.due_date), si + 1]);
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
      <div><div class="t">${esc(s.name)}${many ? ` ×${g.items.length}` : ""}<span class="args"> · ${esc(args)}</span></div><div class="s">${esc(res)}</div></div>
      ${s.status === "error" ? icon("alert", "sm warnicon") : icon("check", "sm")}</li>`;
  }).join("");
  const pending = running ? `<li class="pending"><span class="n"><i class="spin"></i></span><div><div class="s">${t().choosing}</div></div></li>` : "";
  return `<section class="sa-card c5 steps-card">
    <div class="head"><h2>${t().steps}</h2>${badge}</div>
    ${run ? `<ol class="sa-steps">${items}${pending}</ol>` : `<div class="steps-empty">${icon("steps")}<div>${t().stepsEmpty}</div></div>`}
  </section>`;
}

function answerBlock() {
  if (!run) {
    return `<section class="sa-card sage examples"><div class="label">${t().tryAsking}</div>
      <div class="example-list">${t().examples.map(q => `<button class="sa-chip" data-example="${esc(q)}">${esc(q)}</button>`).join("")}</div></section>`;
  }
  const a = run.answer;
  const bubble = `<div class="sa-bubble">${esc(run.question)}</div>`;
  if (run.error) return bubble + `<section class="sa-warncard">${icon("alert")}<div class="wc-body"><h2>The run didn’t finish.</h2><p>${esc(run.error)}</p></div></section>`;
  if (!a) return bubble + `<section class="sa-card thinking">${mascot("think", "think-mascot")}<div class="meta">${t().thinking}</div></section>`;
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
      ${mascot("wave", "answer-mascot")}
      <div class="lead">${t().answer}</div>
      <div class="sa-fig num">${fig}${refFor(a.answer) ? `<a class="sa-ref" href="#step-${refFor(a.answer)}">${refFor(a.answer)}</a>` : ""}</div>
      <div class="sub clamp">${prose(a.text) || esc(a.explanation ?? "")}</div>
    </section>
    ${ls.length ? `<section class="sa-card answer-lines">${breakdownIndex() >= 0 && toolSteps()[breakdownIndex()].args?.month ? `<div class="head" style="margin-bottom:4px"><h2>${t().where(toolSteps()[breakdownIndex()].args.month)}</h2></div>` : ""}<ul class="sa-lines">${ls.map(([l, v, s]) => `<li><span>${l}</span><span class="amt">${typeof v === "number" ? usd(v) : esc(v)}<span class="sa-ref light">${s}</span></span></li>`).join("")}</ul>${feeChips()}${footer()}</section>` : `<section class="sa-card answer-lines">${footer()}</section>`}`;
}

function footer() {
  if (!run?.done) return "";
  const d = run.done;
  return `<div class="answer-foot">
    <span class="promise">${icon("check", "sm")} ${t().promise}</span>
    ${d.session_id ? `<a class="sa-prism" href="${PRISM_SESSIONS}" target="_blank" rel="noopener" title="trace ${esc(d.trace_id ?? "")}"><i></i>Traced in PRISM · ${esc(d.session_id)} ${icon("external", "sm")}</a>` : ""}
  </div>`;
}

function langSeg(ctx) {
  const to = l => ctx.href("ask", { c: ctx.creator, lang: l === "zh" ? "zh" : null, replay: ctx.query.get("replay") });
  return `<div class="sa-seg"><a href="${to("en")}" class="${lang === "en" ? "on" : ""}">English</a><a href="${to("zh")}" class="${lang === "zh" ? "on" : ""}">中文</a></div>`;
}

function view(ctx) {
  const busy = run && !run.done;
  return `<div class="sa-top"><div><h1>Ask</h1><p>Questions in English or Chinese. The agent looks things up step by step; code does the math.</p></div>
    <div class="right">${run?.replay ? `<span class="sa-badge sim">${t().replay}</span>` : ""}${langSeg(ctx)}${ctx.whoPill(ctx)}</div></div>
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
  const want = lang;
  const rec = await (await fetch(REPLAYS[want])).json();
  run = { question: rec.question, creator: rec.creator, steps: [], answer: null, done: null, error: null, replay: true, lang: want };
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
  lang = ctx.query.get("lang") === "zh" ? "zh" : "en";
  return view(ctx);
}

export function mount(ctx, el) {
  root = el;
  ctxRef = ctx;
  bind();
  if (ctx.query.get("replay") && !(run?.replay && run.lang === lang)) replay();
  else if (ctx.query.get("go") && ctx.query.get("q") && !run) start(ctx.query.get("q"), ctx);
}

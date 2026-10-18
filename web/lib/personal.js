// Client for /api/personal/*: every request carries the stored (already relabelled) files and the
// settings in its body; the server computes in memory and keeps nothing. Nothing goes in the URL,
// nothing is logged here, and responses are never cached by the browser (cache: "no-store"). Answers
// are kept in memory for this tab until the files or settings change.
import { english } from "./display.js";
import { sendable } from "./store.js";
import { localDay } from "./format.js";

const cache = new Map();
let formatsPromise = null;

export const invalidate = () => cache.clear();

export function formats() {
  if (!formatsPromise) {
    formatsPromise = fetch("/api/personal/formats", { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }).catch(e => { formatsPromise = null; throw e; });
  }
  return formatsPromise;
}

function body(data, params) {
  const s = data.settings;
  return {
    files: sendable(data).map(f => ({ name: f.name, content: f.content })),
    entries: (data.entries ?? []).map(sendableEntry), // notes stay in the browser
    monthly_goal: s.monthly_goal ?? null,
    tax_home: s.tax_home, currency: s.currency, set_aside_rate: Math.min(0.6, Math.max(0, s.set_aside_rate)),
    after: localDay(), // deadlines count from the viewer's today, not the server's
    ...params,
  };
}

// A readable message from an error response: {detail: "…"} or {detail: {message, import}}.
async function failure(r) {
  let detail = null;
  try { detail = (await r.json()).detail; } catch { /* not JSON */ }
  const msg = typeof detail === "string" ? detail : detail?.message ?? (Array.isArray(detail) ? "This request couldn’t be read." : `${r.status}`);
  return Object.assign(new Error(msg), { status: r.status, detail });
}

// An entry as the server sees it: no note, nothing else from the browser.
export const sendableEntry = ({ id, kind, date, amount, currency, source, category }) =>
  ({ id, kind, date, amount, currency, source: source || null, ...(kind === "expense" ? { category } : {}) });

export function post(path, params, data) {
  const key = `${path}|${JSON.stringify(params)}|${JSON.stringify(data.settings)}|${data.files.map(f => f.id).join(",")}|${JSON.stringify((data.entries ?? []).map(sendableEntry))}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`/api/personal/${path}`, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body(data, params)),
    }).then(async r => {
      if (!r.ok) throw await failure(r);
      return english(await r.json());
    }).catch(e => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

// POST /api/personal/ask streams Server-Sent Events like /api/ask: step… answer, done (or error, done).
export async function ask(question, data, onEvent) {
  const res = await fetch("/api/personal/ask", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body(data, {}), question }),
  });
  if (!res.ok || !res.body) throw await failure(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const payload = /^data: (.*)$/m.exec(block)?.[1];
      if (event && payload) onEvent(event, english(JSON.parse(payload)));
    }
  }
}

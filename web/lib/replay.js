// Recorded Ask Tilly runs (web/demo/ask-replays.json) for Moon Spirit's account as it was loaded, played
// when the server has no model key. A recording is used only when this browser's statements, entries,
// goal, settings and the question are the ones it was recorded on; account labels differ per browser,
// so they are left out of the comparison.
import { sendableEntry } from "./personal.js";
import { sendable } from "./store.js";

function canon(data, question) {
  const s = data.settings;
  return JSON.stringify({
    files: sendable(data).map(f => ({ name: f.name, content: f.content.replace(/acct-\d{4}/g, "acct") }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    entries: (data.entries ?? []).map(sendableEntry).sort((a, b) => a.id.localeCompare(b.id)),
    goal: s.monthly_goal ?? null,
    settings: { currency: s.currency, tax_home: s.tax_home, set_aside_rate: s.set_aside_rate, payout_methods: s.payout_methods ?? {} },
    question: question.trim(),
  });
}

export async function fingerprint(data, question) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon(data, question)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// The recorded events for this exact account and question, or null.
export async function findReplay(data, question) {
  try {
    const index = await (await fetch("demo/ask-replays.json", { cache: "no-store" })).json();
    const fp = await fingerprint(data, question);
    const hit = index.runs.find(r => r.fingerprint === fp);
    return hit ? await (await fetch(`demo/${hit.file}`, { cache: "no-store" })).json() : null;
  } catch {
    return null;
  }
}

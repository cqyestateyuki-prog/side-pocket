// Thin client for the Side Atlas API. Every money figure on screen comes through here.

const cache = new Map();

export async function get(path, params = {}) {
  const url = `/api/${path}?${new URLSearchParams(params)}`;
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(async r => {
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    }).catch(e => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}

// POST /api/ask streams Server-Sent Events: step… answer, done (or error, done).
export async function ask(question, creator, onEvent) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, creator }),
  });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text()}`);
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
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) onEvent(event, JSON.parse(data));
    }
  }
}

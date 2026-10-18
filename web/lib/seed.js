// Moon Spirit's account: the person this app opens on. Her statements, rate tables, entries and goal
// (web/demo/samples, written by scripts/make_samples.py) go into the browser store the same way an upload
// does, so account IDs are relabelled before anything is stored. Fictional data.
import * as store from "./store.js";
import { formats, invalidate, post } from "./personal.js";
import { labeler, prepare } from "./statements.js";
import { seeded, setSeeded } from "./prefs.js";

const BASE = "demo/samples/";

async function fetchOk(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
}

// Load her account into an empty store. Returns the saved data.
export async function seed() {
  const index = await (await fetchOk(`${BASE}index.json`)).json();
  const [fmt, data] = await Promise.all([formats(), store.load()]);
  const label = labeler(data.salt, data.labels);
  const files = [];
  for (const name of index.files) {
    const blob = await (await fetchOk(BASE + name)).blob();
    const entry = await prepare(new File([blob], name, { type: "text/csv" }), fmt, label);
    files.push({ ...entry, id: store.newId(), added: new Date().toISOString() });
  }
  const profile = index.profile ?? {};
  const next = await store.save({ files, labels: data.labels, entries: profile.entries ?? [],
                                  settings: { ...store.DEFAULT_SETTINGS, ...profile.settings } });
  invalidate();
  const res = await post("detect", {}, next);
  setSeeded(true);
  return store.save({ summary: res.import });
}

// The first visit to any screen loads her account once; after Delete all data the store stays empty
// until she signs out and continues again (welcome calls seed() directly).
export async function seedOnFirstVisit() {
  const data = await store.load();
  if (store.hasData(data) || data.files.length || (seeded() && data.persistent)) return data;
  return seed();
}

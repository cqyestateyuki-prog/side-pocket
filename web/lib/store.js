// "Your data": the statements a person uploads and their settings, kept in this browser only
// (IndexedDB). Files are stored after the browser has replaced every account ID with a short label
// (lib/statements.js), so real account IDs are never stored or sent. When IndexedDB is unavailable
// (private window, blocked site data) everything lives in memory for this tab and `persistent` is
// false, so the UI can say so. Every storage call is wrapped; the app works without it.

const DB = "side-atlas", STORE = "kv", KEYS = ["files", "settings", "salt", "labels", "summary"];
export const DEFAULT_SETTINGS = { tax_home: "US", currency: "USD", set_aside_rate: 0.25 };

let state = null;      // { files, settings, salt, labels, summary, persistent }
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("blocked"));
      } catch (e) { reject(e); }
    }).catch(() => null);
  }
  return dbPromise;
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function randomHex(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

// The stored data, loaded once per tab.
export async function load() {
  if (state) return state;
  const fresh = { files: [], settings: { ...DEFAULT_SETTINGS }, salt: null, labels: {}, summary: null, persistent: false };
  const db = await openDb();
  if (db) {
    try {
      const values = await Promise.all(KEYS.map(k => tx(db, "readonly", s => s.get(k))));
      KEYS.forEach((k, i) => { if (values[i] != null) fresh[k] = values[i]; });
      fresh.settings = { ...DEFAULT_SETTINGS, ...fresh.settings };
      fresh.persistent = true;
    } catch { fresh.persistent = false; }
  }
  if (!fresh.salt) fresh.salt = randomHex(16);
  state = fresh;
  return state;
}

// Merge `patch` into the data and write the changed keys through to IndexedDB.
export async function save(patch) {
  const s = await load();
  Object.assign(s, patch);
  if (!s.persistent) return s;
  const db = await openDb();
  try {
    await tx(db, "readwrite", st => { for (const k of KEYS) if (k in patch || k === "salt") st.put(s[k], k); });
  } catch { s.persistent = false; }
  return s;
}

export async function saveSettings(patch) {
  const s = await load();
  return save({ settings: { ...s.settings, ...patch } });
}

// Delete all my data: the stored statements, labels, salt and settings.
export async function clear() {
  const db = await openDb();
  if (db) {
    try { await tx(db, "readwrite", st => st.clear()); } catch { /* nothing stored */ }
  }
  const persistent = state?.persistent ?? false;
  state = { files: [], settings: { ...DEFAULT_SETTINGS }, salt: randomHex(16), labels: {}, summary: null, persistent };
}

// Files the server can read: statements and rate files (unreadable ones are kept by name only).
export const sendable = s => s.files.filter(f => f.content);
export const hasData = s => s.files.some(f => f.kind === "statement");
export const newId = () => randomHex(6);

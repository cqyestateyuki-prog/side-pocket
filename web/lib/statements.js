// Reading statements in the browser, before anything is stored or sent. For each file:
// 1. decode it (UTF-8, or GB18030 for a Chinese export saved that way);
// 2. find its header row and platform from GET /api/personal/formats (the server's own rules);
// 3. replace every value in the platform's account column with a stable label ("acct-4821": four
//    digits of a salted SHA-256 the browser keeps), and drop the columns the server never reads
//    (client names and notes stay on the device);
// 4. hand back the cleaned CSV text. The original file is never stored.
// Files that aren't a statement or a rate file keep only their name and the reason.

const SCAN_FALLBACK = 10;

export async function decode(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("gb18030").decode(buf);
  }
}

// RFC 4180: quoted fields, doubled quotes, commas and line breaks inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

const quote = v => /[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
export const toCsv = rows => rows.map(r => r.map(v => quote(String(v ?? ""))).join(",")).join("\n") + "\n";

// The server's header rule: drop a BOM, full-width brackets become ASCII, no whitespace, lowercase.
export const norm = s => String(s).replace(/^﻿/, "").replace(/（/g, "(").replace(/）/g, ")").replace(/\s+/g, "").toLowerCase();

function findHeader(rows, formats) {
  const scan = formats.matching?.header_scan_lines ?? SCAN_FALLBACK;
  for (let i = 0; i < Math.min(scan, rows.length); i++) {
    const cells = new Set(rows[i].map(norm));
    const fmt = formats.statements.find(f => f.columns.every(c => cells.has(norm(c))));
    if (fmt) return { kind: "statement", at: i, fmt };
    const raw = rows[i].map(c => c.replace(/^﻿/, "").trim());
    if (cells.has("date") && (cells.has("cny_per_usd") || raw.some(c => /^[A-Z]{3}$/.test(c)))) return { kind: "rates", at: i };
  }
  return null;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Stable four-digit labels per platform. `labels` maps "platform:hash" to a label and is kept with
// the data, so the same account gets the same label in later imports; a clash moves to the next free number.
export function labeler(salt, labels) {
  return async (platform, account) => {
    const value = account.trim();
    if (!value) return value;
    const hash = await sha256Hex(`${salt}\u0000${platform}\u0000${value}`);
    const key = `${platform}:${hash}`;
    if (labels[key]) return labels[key];
    const used = new Set(Object.entries(labels).filter(([k]) => k.startsWith(platform + ":")).map(([, v]) => v));
    let n = parseInt(hash.slice(0, 8), 16) % 10000;
    while (used.has(`acct-${String(n).padStart(4, "0")}`)) n = (n + 1) % 10000;
    labels[key] = `acct-${String(n).padStart(4, "0")}`;
    return labels[key];
  };
}

const isCsvName = name => /\.(csv|txt)$/i.test(name);

// One file in, one stored entry out: { name, kind, platform, content, accounts, reason }.
export async function prepare(file, formats, label) {
  const base = { name: file.name, size: file.size };
  if (!isCsvName(file.name) && file.type && file.type !== "text/csv") return { ...base, kind: "unknown", reason: "not_csv" };
  const rows = parseCsv(await decode(file));
  if (!rows.length) return { ...base, kind: "empty", reason: "empty" };
  const found = findHeader(rows, formats);
  if (!found) return { ...base, kind: "unknown", reason: isCsvName(file.name) ? "not_recognized" : "not_csv" };
  const header = rows[found.at], body = rows.slice(found.at + 1);
  if (found.kind === "rates") return { ...base, kind: "rates", content: toCsv([header, ...body]) };

  const f = found.fmt;
  const keep = new Set([f.account_column, ...f.columns, f.date_column, f.currency_column, f.ref_column].filter(Boolean).map(norm));
  const cols = header.map((h, i) => keep.has(norm(h)) ? i : -1).filter(i => i >= 0);
  const acct = header.findIndex(h => norm(h) === norm(f.account_column));
  const accounts = new Set();
  const out = [];
  for (const r of body) {
    const row = [...r];
    if (acct >= 0 && row[acct] != null) {
      row[acct] = await label(f.platform, row[acct]);
      if (row[acct]) accounts.add(row[acct]);
    }
    out.push(cols.map(i => row[i] ?? ""));
  }
  if (!out.length) return { ...base, kind: "empty", platform: f.platform, reason: "empty" };
  return { ...base, kind: "statement", platform: f.platform, accounts: [...accounts], content: toCsv([cols.map(i => header[i]), ...out]) };
}

// Bytes this set of files adds to a request body (JSON-escaped text), for the client-side limit.
export const bodyBytes = files => new TextEncoder().encode(JSON.stringify(files.map(f => ({ name: f.name, content: f.content })))).length;

// "acct-4821" as the UI shows it.
export const shortLabel = a => /^acct-\d{4}$/.test(a) ? `acct ••${a.slice(5)}` : a;

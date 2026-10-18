// My data (kit 10 and 11): bring your own statements. Files are read and relabelled in this browser
// (lib/statements.js), kept in IndexedDB (lib/store.js) and checked by POST /api/personal/detect.
// Backups (one JSON file from Settings & privacy) can be dropped here too.
import { YOURS } from "../lib/copy.js";
import { dateShort, esc, icon, monthShort, picon, quarterOf } from "../lib/format.js";
import { mascot } from "../lib/mascot.js";
import * as store from "../lib/store.js";
import { bodyBytes, labeler, prepare, shortLabel } from "../lib/statements.js";
import { formats, invalidate, post } from "../lib/personal.js";

const X = YOURS;
const LABEL = { bilibili: "Bilibili", youtube: "YouTube", twitch: "Twitch", patreon: "Patreon", upwork: "Upwork", fiverr: "Fiverr", freelancer: "Freelancer.com", contra: "Contra" };
// Where each export lives (same list as the import drawer; paths may change).
const WHERE = [
  ["upwork", "upwork_transactions.csv", "Reports → Transaction history → Download CSV"],
  ["fiverr", "fiverr_earnings.csv", "Earnings → Download CSV"],
  ["freelancer", "freelancer_transactions.csv", "Payments → Transaction History → Export"],
  ["contra", "contra_payments.csv", "Payments → Export"],
  ["youtube", "youtube_revenue.csv", "Studio → Analytics → Revenue → Export"],
  ["twitch", "twitch_payouts.csv", "Creator Dashboard → Insights → Revenue → Export"],
  ["patreon", "patreon_earnings.csv", "Creator Settings → Earnings → Export"],
  ["bilibili", "bilibili_income.csv", "Creator Center → Earnings → Export"],
];
const NOT_READ = {
  not_csv: [X.BAD_FILE, "Not a CSV"],
  not_recognized: [X.NOT_RECOGNIZED, "Not recognized"],
  empty: [X.EMPTY_FILE, "Empty"],
};
const MARGIN = 20_000; // room for the settings and the rest of a request body

let notes = []; // [{ kind: "info" | "warn", text }] from the last import, shown until the next one

// Kit v1.4.1: three short promises; the details live in Settings & privacy.
const promiseStrip = () => `<ul class="sa-promise short c12">${[["monitor", X.PROMISE_BROWSER], ["server", X.PROMISE_SERVER], ["ask", X.PROMISE_AI]]
  .map(([ic, t]) => `<li><span class="ic">${icon(ic)}</span><span>${t}</span></li>`).join("")}<li class="more"><a href="#settings">${X.PROMISE_MORE}</a></li></ul>`;

const fileInput = `<input type="file" data-files accept=".csv,text/csv,.txt,.json,application/json" multiple hidden>`;

function noteList() {
  return notes.map(n => `<div class="c12 sa-note ${n.kind}">${icon(n.kind === "warn" ? "alert" : "info", "sm")}<span>${esc(n.text)}</span></div>`).join("");
}

// ---------------------------------------------------------------- 10 · nothing imported yet

function emptyView(ctx) {
  const unread = ctx.data.files.filter(f => !f.content);
  return `
  <div class="sa-top"><div><h1>My data</h1><p>Nothing imported yet</p></div><div class="right">${ctx.whoPill(ctx)}</div></div>
  <div class="sa-grid">
    ${ctx.data.persistent ? "" : `<div class="c12 sa-note warn">${icon("alert", "sm")}<span>${X.STORAGE_OFF}</span></div>`}
    ${noteList()}
    <section class="sa-hero drop slim c12" data-drop>
      <div class="orb"></div>
      ${mascot("wave", "hero-mascot")}
      <div class="sa-speech mydata-speech">${X.EMPTY_MASCOT}</div>
      <div class="title">${X.MYDATA_HEADLINE}</div>
      <div class="actions"><button type="button" class="sa-btn on-dark" data-choose>${icon("upload", "sm")} Choose CSV files</button></div>
      ${fileInput}
    </section>
    ${promiseStrip()}
    ${unread.length ? filesCard(ctx, null, null) : ""}
    <details class="sa-card sa-howto c12">
      <summary>${X.WHERE_TITLE}</summary>
      <div class="sa-where">${WHERE.map(([k, , w]) => `<div><b>${picon(k)}${LABEL[k]}</b><div class="path">${w}</div></div>`).join("")}</div>
    </details>
  </div>`;
}

// ---------------------------------------------------------------- 11 · after import

function range(files) {
  const firsts = files.map(f => f.first_date).filter(Boolean).sort(), lasts = files.map(f => f.last_date).filter(Boolean).sort();
  return { first: firsts[0], last: lasts.at(-1) };
}

// The period the hero and the import check cover: the one quarter the files fall in, or all their months.
function coverage(months) {
  const qs = [...new Set(months.map(quarterOf))];
  if (qs.length === 1) return { period: qs[0], label: `Q${qs[0].slice(-1)} ${qs[0].slice(0, 4)}` };
  const a = months[0], b = months.at(-1);
  return { period: `${a}~${b}`, label: `${monthShort(a)} ${a.slice(0, 4) === b.slice(0, 4) ? "" : a.slice(0, 4) + " "}to ${monthShort(b)} ${b.slice(0, 4)}` };
}

function filesCard(ctx, sum, R) {
  const byName = Object.fromEntries((sum?.files ?? []).map(f => [f.file, f]));
  const missing = {};
  for (const i of R?.issues ?? []) missing[i.platform] = (missing[i.platform] ?? 0) + 1;
  const remove = id => `<button type="button" class="sa-linkbtn" data-remove="${id}">${icon("trash", "sm")} Remove</button>`;
  const rows = ctx.data.files.map(f => {
    const s = byName[f.name] ?? {};
    if (!f.content || s.kind === "unknown" || s.kind === "empty") {
      const [text, badge] = NOT_READ[f.reason] ?? NOT_READ[s.kind === "empty" ? "empty" : "not_recognized"];
      return `<tr class="bad"><td><i class="sa-pdot" style="background:var(--sa-line-strong)"></i><b>Not read</b></td><td><span class="file">${esc(f.name)}</span></td>
        <td class="money">0</td><td colspan="2" class="msg">${esc(text)}</td><td><span class="sa-badge warn">${badge}</span></td><td style="text-align:right">${remove(f.id)}</td></tr>`;
    }
    if (s.kind === "rates") {
      const cs = Object.entries(s.rates ?? {});
      const r = range(cs.map(([, v]) => v));
      return `<tr><td><i class="sa-pdot" style="background:var(--sa-fx)"></i><b>Exchange rates</b><span class="acct">your rate file</span></td><td><span class="file">${esc(f.name)}</span></td>
        <td class="money">${s.rows ?? 0}</td><td class="num">${r.first ? `${dateShort(r.first)} to ${dateShort(r.last)}` : "—"}</td><td>${cs.map(([c]) => c).join(", ")}</td>
        <td><span class="sa-badge ok">None</span></td><td style="text-align:right">${remove(f.id)}</td></tr>`;
    }
    const label = LABEL[f.platform] ?? s.label ?? f.platform;
    const need = s.platform ? missing[s.label] ?? missing[label] ?? 0 : 0;
    const issue = s.kind === "duplicate" ? `<span class="sa-badge sim" title="${esc(s.message ?? "")}">Counted once</span>`
      : need ? `<span class="sa-badge warn">${need} need${need === 1 ? "s" : ""} a rate</span>`
      : s.skipped_rows ? `<span class="sa-badge warn" title="${esc(s.skipped?.map(x => `line ${x.line}`).join(", ") ?? "")}">${s.skipped_rows} row${s.skipped_rows === 1 ? "" : "s"} skipped</span>`
      : `<span class="sa-badge ok">None</span>`;
    return `<tr><td>${picon(f.platform)}<b>${esc(label)}</b>${(s.accounts ?? f.accounts ?? []).map(a => `<span class="acct">${esc(shortLabel(a))}</span>`).join("")}</td>
      <td><span class="file">${esc(f.name)}</span></td><td class="money">${s.rows ?? "—"}</td>
      <td class="num">${s.first_date ? `${dateShort(s.first_date)} to ${dateShort(s.last_date)}` : "—"}</td><td>${(s.currencies ?? []).join(", ")}</td>
      <td>${issue}</td><td style="text-align:right">${remove(f.id)}</td></tr>`;
  }).join("");
  return `<section class="sa-card c12">
      <div class="head"><h2>Imported statements</h2><span class="meta">${X.FILES_NOTE}</span></div>
      <div class="sa-tablewrap"><table class="sa-table sa-files">
        <thead><tr><th>Platform</th><th>File</th><th class="money">Rows</th><th>Dates</th><th>Currency</th><th>Issues</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </section>`;
}

async function importedView(ctx) {
  const sum = ctx.data.summary ?? { files: [], months: [], records: 0 };
  const cov = sum.months.length ? coverage(sum.months) : null;
  let R = null, failed = null;
  try { R = cov ? await ctx.load("report", { period: cov.period }) : null; } catch (e) { failed = e.message; }
  const stmts = sum.files.filter(f => f.kind === "statement");
  const read = sum.files.filter(f => f.kind === "statement" || f.kind === "rates").length;
  const platforms = new Set(stmts.map(f => f.platform)).size;
  const unread = ctx.data.files.filter(f => !f.content);
  const { first, last } = range(stmts);

  // Records that need an exchange rate for the display currency, and how many found one.
  const other = stmts.filter(f => (f.currencies ?? []).some(c => c !== ctx.cur));
  const need = other.reduce((n, f) => n + (f.records ?? 0), 0);
  const missing = R?.issues?.length ?? 0;
  const curs = [...new Set(other.flatMap(f => f.currencies.filter(c => c !== ctx.cur)))];
  const ratesLine = X.CHECK_RATES.replace("CNY", curs.join(" and "));
  const extra = [
    ...(sum.overlaps ?? []).map(o => o.message),
    ...(sum.rates_note ? [sum.rates_note] : []),
    ...(failed ? [failed] : []),
  ];

  const t = R?.totals;
  const kept = ctx.data.persistent ? "Kept in this browser" : "Kept in this tab only";
  return `
  <div class="sa-top"><div><h1>My data</h1><p>${X.IMPORTED_SUB.replace("{files}", read).replace("{records}", sum.records)}</p></div>
    <div class="right"><button type="button" class="sa-btn primary sm" data-choose>${icon("upload", "sm")} Add statements</button>${fileInput}${ctx.whoPill(ctx)}</div></div>
  <div class="sa-grid" data-drop>
    ${ctx.data.persistent ? "" : `<div class="c12 sa-note warn">${icon("alert", "sm")}<span>${X.STORAGE_OFF}</span></div>`}
    ${noteList()}
    <section class="sa-hero c7" style="min-height:0">
      <div class="orb"></div>
      ${mascot("celebrate", "hero-mascot")}
      <div class="lead">${cov ? X.LEDGER_HERO.replace("Q3 2026", cov.label) : X.LEDGER_HERO.replace("Q3 2026 ", "")}</div>
      ${t ? `<div class="sa-fig num">${ctx.money(t.net)}</div>
      <div class="sub">net from <b class="num">${ctx.money(t.gross)}</b> gross · ${sum.records} records${first ? ` · ${dateShort(first)} to ${dateShort(last)}` : ""}</div>` : ""}
      <div class="actions"><a class="sa-btn on-dark sm" href="#ledger">${icon("ledger", "sm")} Open the ledger</a><span class="glass">${icon("lock", "sm")} ${kept}</span></div>
    </section>
    <section class="sa-card c5">
      <div class="head"><h2>Import check</h2><span class="sa-badge ok">${icon("check", "sm")} ${read} file${read === 1 ? "" : "s"} read</span></div>
      <ul class="sa-checklist">
        <li>${icon("check", "sm ok")}<span>${X.CHECK_PLATFORMS}</span><span class="r num">${platforms} of 8</span></li>
        ${need ? `<li>${icon(missing ? "alert" : "check", `sm ${missing ? "bad" : "ok"}`)}<span>${ratesLine}</span><span class="r num">${need - missing} of ${need}</span></li>` : ""}
        <li>${icon("check", "sm ok")}<span>${X.CHECK_LABELS}</span><span class="r">in your browser</span></li>
        ${unread.map(f => `<li>${icon("alert", "sm bad")}<span>${esc(X.NOT_READ.replace("{file}", f.name))}</span><span class="r">1 file</span></li>`).join("")}
      </ul>
      ${extra.map(m => `<div class="sa-note info" style="margin-top:10px;padding:10px 12px">${icon("info", "sm")}<span>${esc(m)}</span></div>`).join("")}
    </section>
    ${filesCard(ctx, sum, R)}
  </div>`;
}

export async function render(ctx) {
  return store.hasData(ctx.data) ? importedView(ctx) : emptyView(ctx);
}

// ---------------------------------------------------------------- importing

// Ask the server what each stored file is (no rates fetched) and keep the answer with the files.
async function check(data) {
  const sendable = store.sendable(data);
  if (!sendable.length) return store.save({ summary: null });
  const res = await post("detect", {}, data);
  return store.save({ summary: res.import });
}

// Two files with one name would be ambiguous in the import check, so later ones get a number.
function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let n = 2;
  while (taken.has(`${stem} (${n})${ext}`)) n++;
  return `${stem} (${n})${ext}`;
}

async function addFiles(list) {
  const data = await store.load();
  const fmt = await formats();
  const limit = fmt.limits ?? { max_files: 40, max_body_bytes: 4_000_000 };
  const label = labeler(data.salt, data.labels);
  const added = [];
  const contents = new Set(data.files.filter(f => f.content).map(f => f.content));
  const taken = new Set(data.files.map(f => f.name));
  for (const file of list) {
    if (/\.json$/i.test(file.name)) { await loadBackup(file); continue; }
    if (file.size > limit.max_body_bytes) { notes.push({ kind: "warn", text: X.TOO_LARGE }); continue; }
    const entry = await prepare(file, fmt, label);
    if (entry.content && contents.has(entry.content)) { notes.push({ kind: "info", text: X.ALREADY_ADDED.replace("{file}", file.name) }); continue; }
    if (entry.content) {
      const sendable = [...store.sendable(data), ...added.filter(f => f.content), entry];
      if (sendable.length > limit.max_files) { notes.push({ kind: "warn", text: X.TOO_MANY }); continue; }
      if (bodyBytes(sendable) + MARGIN > limit.max_body_bytes) { notes.push({ kind: "warn", text: X.TOO_LARGE }); continue; }
      contents.add(entry.content);
    }
    entry.name = uniqueName(entry.name, taken);
    taken.add(entry.name);
    added.push({ ...entry, id: store.newId(), added: new Date().toISOString() });
  }
  if (!added.length) return;
  const next = await store.save({ files: [...(await store.load()).files, ...added], labels: data.labels });
  invalidate();
  await check(next);
}

async function importAll(list, ctx) {
  notes = [];
  try {
    await addFiles([...list]);
  } catch (e) {
    notes.push({ kind: "warn", text: e.message });
  }
  invalidate();
  ctx.refresh();
}

// A backup from Settings & privacy. Into an empty browser it restores everything (labels stay the
// same); next to existing statements it only adds the files that aren't there yet.
export async function loadBackup(file) {
  let b = null;
  try { b = JSON.parse(await file.text()); } catch { /* not JSON */ }
  if (!b || b.app !== "side-atlas" || b.kind !== "backup" || !Array.isArray(b.files)) {
    notes.push({ kind: "warn", text: X.BACKUP_BAD });
    return;
  }
  const data = await store.load();
  const files = b.files.filter(f => typeof f.name === "string" && (f.content == null || typeof f.content === "string"))
    .map(f => ({ name: f.name, kind: f.kind, platform: f.platform, accounts: f.accounts, content: f.content ?? null, reason: f.reason, id: store.newId(), added: new Date().toISOString() }));
  let next;
  if (!data.files.length) {
    next = await store.save({ files, salt: b.salt || data.salt, labels: b.labels ?? {}, settings: { ...store.DEFAULT_SETTINGS, ...b.settings } });
  } else {
    const have = new Set(data.files.map(f => f.content).filter(Boolean));
    next = await store.save({ files: [...data.files, ...files.filter(f => f.content && !have.has(f.content))] });
  }
  notes.push({ kind: "info", text: X.BACKUP_LOADED.replace("{n}", files.filter(f => f.kind === "statement").length) });
  invalidate();
  await check(next);
}

export function mount(ctx, root) {
  const input = root.querySelector("[data-files]");
  root.querySelectorAll("[data-choose]").forEach(b => b.addEventListener("click", () => input?.click()));
  input?.addEventListener("change", () => importAll(input.files, ctx));
  const zone = root.querySelector("[data-drop]");
  if (zone) {
    zone.addEventListener("dragover", ev => { ev.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", ev => { if (!zone.contains(ev.relatedTarget)) zone.classList.remove("over"); });
    zone.addEventListener("drop", ev => {
      ev.preventDefault();
      zone.classList.remove("over");
      importAll(ev.dataTransfer.files, ctx);
    });
  }
  root.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", async () => {
    const data = await store.load();
    const next = await store.save({ files: data.files.filter(f => f.id !== b.dataset.remove) });
    notes = [];
    invalidate();
    try { await check(next); } catch (e) { notes.push({ kind: "warn", text: e.message }); }
    ctx.refresh();
  }));
}

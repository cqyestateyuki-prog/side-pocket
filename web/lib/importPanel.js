// "Import statements" drawer on the Ledger. Gathering the exports is the hard part for people, so
// the panel does three things: takes many CSVs at once and recognises each platform, says where
// each platform's export lives, and shows what the import check found (records it can't convert).
// It doesn't repeat the Ledger (no record counts or totals). Dropped files are read in this
// browser only.
import { esc, icon, monthShort, picon } from "./format.js";
import { COPY } from "./copy.js";
import { mascot } from "./mascot.js";

// label, the file name in the test data, the header columns that identify the export,
// the account column, and the typical place to download it (paths may change).
const PLATFORMS = {
  upwork: { label: "Upwork", file: "upwork_transactions.csv", sig: ["Freelancer", "Service Fee Rate"], where: "Reports → Transaction history → Download CSV" },
  fiverr: { label: "Fiverr", file: "fiverr_earnings.csv", sig: ["Seller", "Order ID"], where: "Earnings → Download CSV" },
  freelancer: { label: "Freelancer.com", file: "freelancer_transactions.csv", sig: ["username", "project_amount"], where: "Payments → Transaction History → Export" },
  contra: { label: "Contra", file: "contra_payments.csv", sig: ["Profile", "Paid On"], where: "Payments → Export" },
  youtube: { label: "YouTube", file: "youtube_revenue.csv", sig: ["Channel ID", "US Tax Withheld (USD)"], where: "Studio → Analytics → Revenue → Export" },
  twitch: { label: "Twitch", file: "twitch_payouts.csv", sig: ["Username", "Twitch Share (USD)"], where: "Creator Dashboard → Insights → Revenue → Export" },
  patreon: { label: "Patreon", file: "patreon_earnings.csv", sig: ["Creator", "Gross Pledges (USD)"], where: "Creator Settings → Earnings → Export" },
  bilibili: { label: "Bilibili", file: "bilibili_income.csv", sig: ["账号ID", "流水(元)"], where: "Creator Center → Earnings → Export" },
};
const API_SOON = ["YouTube", "Twitch", "Patreon", "Upwork", "PayPal"];

let dropped = []; // [{ name, platform, rows, mine }] for the files added in this session

function fileLines(ctx) {
  if (!dropped.length) return "";
  return `<ul class="sa-importlist files">${dropped.map(f => {
    const p = PLATFORMS[f.platform];
    return p
      ? `<li>${picon(f.platform)}<span><b>${esc(f.name)}</b><span class="r">${p.label} export · ${f.mine == null ? `${f.rows} rows` : `${f.mine} of ${f.rows} rows are ${esc(ctx.persona(ctx.me).display)}’s`}</span></span>${icon("check", "sm ok")}</li>`
      : `<li class="bad"><i class="sa-pdot"></i><span><b>${esc(f.name)}</b><span class="r">Not a format Side Pocket reads yet</span></span>${icon("alert", "sm")}</li>`;
  }).join("")}</ul>
  <div class="meta">Checked in your browser only; nothing is uploaded in this demo.</div>`;
}

export function panel(ctx) {
  const mine = Object.fromEntries(ctx.me.platforms.map(p => [p.key, p]));
  const issues = ctx.me.data_issues ?? [];
  const others = ctx.creators.filter(c => c.id !== ctx.creator && c.data_issues?.length);
  const rows = Object.entries(PLATFORMS).map(([k, p]) => {
    const issue = issues.find(i => i.platform === p.label);
    const state = !mine[k] ? `<label class="add" for="sa-files">Add</label>`
      : issue ? `<span class="sa-badge warn">${issue.count} ${esc(issue.currency)} rate missing</span>` : icon("check", "sm ok");
    return `<li class="${mine[k] ? "" : "off"}">${picon(k)}
      <span><b>${p.label}</b> <span class="mono">${p.file}</span><span class="r">${esc(p.where)}</span></span>${state}</li>`;
  }).join("");
  const issueLine = (who, i, c) => `<div class="sa-note warn">${icon("alert", "sm")}<span>${who ? `<b>${esc(who)}</b> · ` : ""}${i.count} record${i.count === 1 ? "" : "s"} can’t be converted: no ${esc(i.currency)} rate for ${esc(i.date)}.
    <a href="${ctx.href("overview", { c, p: i.month })}">Open ${monthShort(i.month)}</a></span></div>`;

  return `<div class="sa-drawer-backdrop" data-close></div>
  <aside class="sa-drawer" role="dialog" aria-label="Import statements">
    <div class="head"><h2>Import statements</h2><button class="sa-btn secondary sm" data-close>Close</button></div>
    <label class="sa-drop compact" for="sa-files" data-drop>
      <div class="drop-row"><div class="ico">${icon("upload")}</div>${mascot("wave", "drop-mascot")}</div>
      <b>${COPY.DROP_TITLE}</b>
      <p>${COPY.DROP_SUB}</p>
      <span class="sa-btn primary sm">${icon("upload", "sm")} Choose CSV files</span>
      <input id="sa-files" type="file" accept=".csv,text/csv" multiple hidden>
    </label>
    <div data-dropped>${fileLines(ctx)}</div>
    ${issues.map(i => issueLine("", i, ctx.creator)).join("")}
    <div class="label section">Where each export lives <span class="meta">· paths may change</span></div>
    <ul class="sa-importlist">${rows}</ul>
    ${others.map(c => issueLine(ctx.persona(c).display, c.data_issues[0], c.id)).join("")}
    <div class="label section">Connect automatically <span class="sa-badge sim">coming soon</span></div>
    <div class="soon">${API_SOON.map(n => `<button class="sa-btn secondary sm" disabled>${n} API</button>`).join("")}
      <button class="sa-btn secondary sm" disabled>${icon("send", "sm")} Forward statement emails</button></div>
    <div class="meta">Official APIs for YouTube, Twitch, Patreon, Upwork and PayPal; email forwarding for the rest.</div>
  </aside>`;
}

function readFiles(files, ctx, wrap) {
  const accounts = Object.fromEntries(ctx.me.platforms.map(p => [p.key, p.account]));
  [...files].forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
      const columns = (lines[0] ?? "").split(",").map(c => c.replace(/^"|"$/g, "").trim());
      const platform = Object.keys(PLATFORMS).find(k => PLATFORMS[k].sig.every(s => columns.includes(s))) ?? null;
      const body = lines.slice(1);
      const acct = platform && accounts[platform];
      const mine = acct ? body.filter(l => l.replace(/^"/, "").startsWith(acct + ",") || l.startsWith(`"${acct}"`)).length : null;
      dropped = [...dropped.filter(d => d.name !== file.name), { name: file.name, platform, rows: body.length, mine }];
      wrap.querySelector("[data-dropped]").innerHTML = fileLines(ctx);
    };
    reader.readAsText(file);
  });
}

// Opens the drawer inside `host`; closing removes it and calls onClose.
export function openPanel(ctx, host, onClose) {
  host.insertAdjacentHTML("beforeend", `<div class="sa-drawer-wrap" data-import>${panel(ctx)}</div>`);
  const wrap = host.querySelector("[data-import]");
  const onKey = ev => { if (ev.key === "Escape") close(); };
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); onClose?.(); };
  wrap.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", close));
  document.addEventListener("keydown", onKey);
  const input = wrap.querySelector("#sa-files");
  const zone = wrap.querySelector("[data-drop]");
  input.addEventListener("change", () => readFiles(input.files, ctx, wrap));
  zone.addEventListener("dragover", ev => { ev.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", ev => {
    ev.preventDefault();
    zone.classList.remove("over");
    readFiles(ev.dataTransfer.files, ctx, wrap);
  });
}

// Pieces several screens share: the page header and the missing-data warning card.
import { COPY } from "./copy.js";
import { cur, dateShort, esc, icon, mmdd } from "./format.js";

export function top(ctx, title, subtitle, { period = true } = {}) {
  return `<div class="sa-top"><div><h1>${title}</h1><p>${subtitle}</p></div>
    <div class="right">${period ? ctx.periodSeg(ctx) : ""}${ctx.whoPill(ctx)}</div></div>`;
}

// Missing data never gets estimated: the forest hero stays, and this light card says what stopped.
export function warnCard(ctx, issues) {
  if (!issues?.length) return "";
  const i = issues[0];
  const r = i.record ?? {};
  const more = issues.length > 1 ? ` · ${issues.length} records waiting for a rate` : " · 1 record waiting for a rate";
  return `<section class="sa-warncard c12">
    <div class="wc-icon">${icon("alert")}</div>
    <div class="wc-body">
      <div class="label">Stopped${more}</div>
      <h2>${COPY.MISSING_HEADLINE}</h2>
      <p>${COPY.MISSING_BODY}</p>
      <div class="wc-actions">
        <a class="sa-btn primary sm" href="${ctx.href("ledger", { c: ctx.creator, p: i.date.slice(0, 7), f: platformKey(i.platform) })}">Add the ${esc(i.currency)} rate for ${dateShort(i.date)}</a>
        <a class="sa-btn secondary sm" href="${ctx.href("ledger", { c: ctx.creator, p: i.date.slice(0, 7), f: platformKey(i.platform) })}">${icon("ledger", "sm")} Open record</a>
      </div>
    </div>
    <ul class="sa-lines wc-record">
      ${[["Platform", esc(i.platform)], ["Type", esc(r.type)], ["Reference", `<span class="mono">${esc(r.ref ?? "—")}</span>`],
         ["Amount", cur(r.amount, r.currency)], ["Date", mmdd(i.date)], [`${esc(i.currency)} → USD rate`, `<span class="sa-badge warn">missing</span>`]]
        .map(([k, v]) => `<li><span>${k}</span><span class="amt">${v}</span></li>`).join("")}
    </ul>
  </section>`;
}

const KEYS = { "B站": "bilibili", "YouTube": "youtube", "Twitch": "twitch", "Patreon": "patreon", "Upwork": "upwork", "Fiverr": "fiverr", "Freelancer.com": "freelancer", "Contra": "contra" };
export const platformKey = label => KEYS[label] ?? String(label).toLowerCase();

export const COUNTRY = { CN: "China", US: "United States", DE: "Germany", JP: "Japan", CA: "Canada", GB: "United Kingdom" };

export function empty(title, body) {
  return `<section class="sa-card sa-empty c12">${icon("info")}<div><b>${title}</b><div class="meta">${body}</div></div></section>`;
}

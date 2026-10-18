// Pieces several screens share: the page header, the missing-data warning card and empty states.
import { COPY, YOURS } from "./copy.js";
import { cur, dateShort, esc, icon, mmdd } from "./format.js";
import { mascot } from "./mascot.js";

// A table header with its outline icon in front (kit v1.4.1).
export const th = (ic, label, cls = "") => `<th class="${cls}"><span class="th-l">${icon(ic, "sm")}${label}</span></th>`;

export function top(ctx, title, subtitle, { period = true, actions = "" } = {}) {
  return `<div class="sa-top"><div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
    <div class="right">${actions}${period ? ctx.periodSeg(ctx) : ""}${ctx.whoPill(ctx)}</div></div>`;
}

// Why a record has no rate, from the API's `reason`.
const NO_RATE = {
  not_in_rate_file: () => "Your rate file has no rate for this date",
  reference_rates_unavailable: () => "ECB rates couldn’t be loaded",
  reference_rates_off: () => "reference rates are off",
  no_reference_rate: i => `no ECB rate in the week up to ${dateShort(i.date)}`,
};
export const noRateText = i => (NO_RATE[i.reason] ?? (x => `no rate for ${x.date}`))(i);

// Missing data never gets estimated: the hero stays, and this light card says what stopped.
export function warnCard(ctx, issues) {
  if (!issues?.length) return "";
  const i = issues[0];
  // A manual entry without a rate (v1.4) has `entry` instead of `record` and no platform.
  const r = i.record ?? (i.entry ? { type: i.entry.kind === "income" ? "Income" : "Expense", ref: null, amount: i.entry.amount, currency: i.entry.currency } : {});
  const who = i.platform ?? i.entry?.label;
  const more = issues.length > 1 ? ` · ${issues.length} records waiting for a rate` : " · 1 record waiting for a rate";
  const open = ctx.href("ledger", { p: i.date.slice(0, 7), f: i.platform ? platformKey(i.platform) : "__own" });
  // The rate comes from the person's own rate file or the ECB, so the card says which and the fix is
  // on My data.
  const fromFile = i.reason === "not_in_rate_file";
  const headline = fromFile ? YOURS.RATE_STOP_TITLE : COPY.MISSING_HEADLINE;
  const body = fromFile ? YOURS.RATE_STOP_BODY : esc(i.message ?? COPY.MISSING_BODY);
  const fix = "#mydata";
  // A USD record shown in CNY needs a USD → CNY rate (the issue names CNY); anything else needs its currency → USD.
  const rateLabel = i.currency === "CNY" && r.currency !== "CNY" ? `${esc(r.currency)} → CNY rate` : `${esc(i.currency)} → USD rate`;
  return `<section class="sa-warncard c12">
    <div class="wc-icon">${icon("alert")}${mascot("worried")}</div>
    <div class="wc-body">
      <div class="label">Stopped${more}</div>
      <h2>${headline}</h2>
      <p>${body}</p>
      <div class="wc-actions">
        <a class="sa-btn primary sm" href="${fix}">Add the ${dateShort(i.date)} rate</a>
        <a class="sa-btn secondary sm" href="${open}">${icon("ledger", "sm")} Open record</a>
      </div>
    </div>
    <ul class="sa-lines wc-record">
      ${[[i.platform ? "Platform" : "Source", esc(who)], ["Type", esc(r.type)], ["Reference", `<span class="mono">${esc(r.ref ?? "—")}</span>`],
         ["Amount", cur(r.amount, r.currency)], ["Date", mmdd(i.date)], [rateLabel, `<span class="sa-badge warn">missing</span>`]]
        .map(([k, v]) => `<li><span>${k}</span><span class="amt">${v}</span></li>`).join("")}
    </ul>
  </section>`;
}

const KEYS = { "Bilibili": "bilibili", "B站": "bilibili", "YouTube": "youtube", "Twitch": "twitch", "Patreon": "patreon", "Upwork": "upwork", "Fiverr": "fiverr", "Freelancer.com": "freelancer", "Contra": "contra" };
export const platformKey = label => KEYS[label] ?? String(label).toLowerCase();

export const COUNTRY = { CN: "China", US: "United States", DE: "Germany", JP: "Japan", CA: "Canada", GB: "United Kingdom" };
// The country's flag (assets/flags, drawn for Side Pocket) in front of its name.
export const flag = c => COUNTRY[c] ? `<img class="sa-flag" src="assets/flags/${c.toLowerCase()}.svg" alt="" width="24" height="16">` : icon("globe", "sm");

export function empty(title, body) {
  return `<section class="sa-card sa-empty c12">${icon("info")}${mascot("think", "empty-mascot")}<div><b>${title}</b><div class="meta">${body}</div></div></section>`;
}

// Nothing in this browser yet (kit 16): Tilly thinking, one title, one sentence, one link to My data.
export function emptyCard(text) {
  return `<div class="sa-emptycard">${mascot("think")}<div><b>${YOURS.EMPTY_TITLE}</b><p>${text}</p></div>
    <a class="sa-btn primary sm" href="#mydata">${icon("upload", "sm")} Go to My data</a></div>`;
}

// A whole screen with nothing imported yet.
export function emptyScreen(ctx, title, text) {
  return `<div class="sa-top"><div><h1>${title}</h1><p>No statements yet</p></div><div class="right">${ctx.whoPill(ctx)}</div></div>
  <div class="sa-grid"><div class="c8">${emptyCard(text)}</div></div>`;
}

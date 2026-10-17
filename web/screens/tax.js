import { get } from "../lib/api.js";
import { COPY } from "../lib/copy.js";
import { cur, dateLong, esc, icon, pcol, periodLabel, usd } from "../lib/format.js";
import { COUNTRY, platformKey, top, warnCard } from "../lib/parts.js";

const STATUS = {
  below: ["sim", "Below 1099-K threshold"],
  over_so_far: ["tax", "Form likely"],
  projected_over: ["tax", "Form likely by year end"],
  not_applicable: ["tax", "CN record"],
};

function formsTable(F) {
  const rows = [...F.platforms].sort((a, b) => b.bank_view_landed_usd - a.bank_view_landed_usd);
  return rows.map(f => {
    const items = f.gap_items_usd;
    const gap = f.gap_usd ?? (items.platform_fees + items.payout_fees + items.tax_withheld + items.refunds);
    const segs = [[items.platform_fees, "var(--sa-fee)"], [items.payout_fees, "var(--sa-payout)"], [items.tax_withheld, "var(--sa-tax)"], [items.refunds, "var(--sa-fx)"]];
    const [cls, text] = f.possible_duplicate_report ? ["warn", "Possible duplicate"] : (STATUS[f.calendar_year.status] ?? ["sim", f.calendar_year.status]);
    const form = f.form === "none" ? "No US form · CN withholding record" : `${f.form} (simulated)`;
    return `<tr>
      <td><i class="sa-pdot" style="background:${pcol(f.platform).fill}"></i><b>${esc(f.label)}</b></td>
      <td><span class="sa-badge sim" title="${esc(f.issuer)}">${esc(form)}</span></td>
      <td class="money">${f.form_view_gross_usd == null ? `<span class="meta">—</span>` : usd(f.form_view_gross_usd)}</td>
      <td class="money net">${usd(f.bank_view_landed_usd)}</td>
      <td><div class="gapcell"><div class="sa-gap">${gap > 0 ? segs.map(([v, c]) => v > 0 ? `<span style="width:${Math.max(4, v / gap * 100)}%;background:${c}"></span>` : "").join("") : ""}</div>
        <span class="num ${gap > 0 ? "" : "meta"}">${gap > 0 ? usd(-gap) : "no gap"}</span></div></td>
      <td class="money">${f.transactions}</td>
      <td><span class="sa-badge ${cls}" title="${esc(f.calendar_year.meaning ?? "")}">${cls === "warn" ? icon("duplicate", "sm") + " " : ""}${text}</span></td></tr>`;
  }).join("");
}

export async function render(ctx) {
  const T = await get("tax-items", { creator: ctx.creator, period: ctx.period });
  const F = T.forms;
  const due = T.next_us_estimated_tax_due;
  const label = periodLabel(ctx.period);
  const issues = [...T.issues, ...F.issues.filter(i => !T.issues.some(j => j.record?.ref === i.record?.ref))];
  const dups = F.platforms.filter(p => p.possible_duplicate_report);
  const withheld = T.tax_withheld_by_platform;
  const noneNote = T.items_for_accountant.find(x => x.startsWith("No tax was withheld"));
  const accountant = [
    ...T.items_for_accountant.filter(x => x !== noneNote),
    ...dups.map(p => `${p.label} pays out through ${p.payout_method}: the same money may appear on two 1099-Ks.`),
    ...issues.map(i => `${i.platform} ${i.record?.ref ?? ""}: no ${i.currency} rate for ${i.date} — left out until the rate is added.`),
  ];
  const T4 = F.totals_for_platforms_with_forms;

  return top(ctx, "Tax items", label) + `
  <div class="sa-grid">
    ${warnCard(ctx, issues)}
    <section class="sa-hero c8 tax-hero">
      <div>
        <div class="title">${COPY.TAX_HERO}</div>
        <div class="sub" style="margin-top:10px;max-width:470px">${COPY.TAX_SUB}</div>
        ${ctx.me.tax_country === "US" ? "" : `<div class="sub" style="margin-top:8px">${icon("globe", "sm")} ${COUNTRY[ctx.me.tax_country] ?? ctx.me.tax_country} tax home: US estimated-tax dates don’t apply.</div>`}
        <div class="amount">
          <div class="sa-fig num">${usd(T.set_aside.amount)}</div>
          <div class="sub">to set aside: ${usd(T.total_net_usd)} ${ctx.period.includes("Q") ? `Q${ctx.period.slice(-1)} ` : ""}net × the ${Math.round(T.set_aside.rate * 100)}% you chose</div>
        </div>
      </div>
      ${due?.due_date && ctx.me.tax_country === "US" ? `<div class="sa-count">
        <div class="days num">${due.days_left}</div>
        <div class="of">days to the next US<br>estimated-tax payment</div>
        <div class="glass">${icon("calendar", "sm")} ${dateLong(due.due_date)}</div>
      </div>` : ""}
    </section>
    <section class="sa-card c4">
      <div class="head"><h2>Tax already withheld</h2></div>
      ${withheld.length ? withheld.map(w => `<div class="withheld">
        <div><span class="sa-badge tax">${icon("globe", "sm")} ${COUNTRY[w.country] ?? w.country} · ${esc(w.platform)}</span>
          <div class="meta">${w.country === "CN" ? "Individual income tax, withheld by the platform" : esc(w.tax)}</div></div>
        <div class="amt"><div class="sa-fig num">${usd(w.withheld_usd)}</div>${w.withheld_cny != null ? `<div class="meta num">${cur(w.withheld_cny, "CNY")}</div>` : ""}</div>
      </div>`).join("") : `<div class="meta">No platform withheld tax in ${label.split(" · ")[0]}.</div>`}
      ${noneNote ? `<div class="sa-note info" style="margin-top:16px">${icon("info", "sm")}<span>${esc(noneNote.replace("No tax was withheld on income from", "Nothing was withheld on").replace("; the set-aside covers it", ". The set-aside covers that income."))}</span></div>` : ""}
    </section>
    <section class="sa-card c12">
      <div class="head"><div><h2>${COPY.FORMS_HEADLINE}</h2><div class="mid" style="margin-top:6px;max-width:760px">${COPY.FORMS_SUB}</div></div>
        <span class="sa-ribbon">${icon("info", "sm")} Simulated forms · real 1099-K threshold</span></div>
      <div class="sa-tablewrap"><table class="sa-table">
        <thead><tr><th>Platform</th><th>Form</th><th class="money">Form view</th><th class="money">Bank view</th><th>${COPY.GAP_LABEL}</th><th class="money">Records</th><th>Status</th></tr></thead>
        <tbody>${formsTable(F)}
          <tr class="total"><td colspan="2">Platforms with forms</td><td class="money">${usd(T4.form_view_gross_usd)}</td><td class="money">${usd(T4.bank_view_landed_usd)}</td><td class="num">${usd(-T4.gap_usd)}</td><td></td><td></td></tr>
        </tbody></table></div>
      <div class="sa-grid notes">
        <div class="sa-note info ${dups.length ? "c6" : "c12"}">${icon("info", "sm")}<span>${COPY.THRESHOLD_NOTE}</span></div>
        ${dups.length ? `<div class="sa-note warn c6">${icon("duplicate", "sm")}<span>${COPY.DUPLICATE_NOTE} <b>${dups.map(d => esc(d.label)).join(", ")}</b> pays out to ${esc(dups[0].payout_method)}.</span></div>` : ""}
      </div>
    </section>
    <section class="sa-card c12 accountant">
      <div><div class="head"><h2>For your accountant</h2></div>
        <ul class="sa-check" data-checklist>${accountant.map(x => `<li><button class="box" aria-label="Mark done"></button><span>${esc(x)}</span></li>`).join("")}</ul></div>
      <a class="sa-btn primary" href="${ctx.href("report", { c: ctx.creator, p: ctx.period })}">${icon("download", "sm")} Export for my accountant</a>
    </section>
  </div>`;
}

export function mount(ctx, root) {
  root.querySelector("[data-checklist]")?.addEventListener("click", ev => {
    const box = ev.target.closest(".box");
    if (box) box.classList.toggle("done");
  });
}

export { platformKey };

import { get } from "../lib/api.js";
import { COPY } from "../lib/copy.js";
import { cur, dateLong, esc, icon, pcol, periodLabel, usd } from "../lib/format.js";
import { COUNTRY, platformKey, top, warnCard } from "../lib/parts.js";
import { mascot } from "../lib/mascot.js";
import { saveExcluded, saveRate, setAside } from "../lib/prefs.js";

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
      <td>${f.form_view_gross_usd == null
        ? `<span class="meta">—</span>`  // no form to reconcile against, so there is no gap to show
        : `<div class="gapcell"><div class="sa-gap">${gap > 0 ? segs.map(([v, c]) => v > 0 ? `<span style="width:${Math.max(4, v / gap * 100)}%;background:${c}"></span>` : "").join("") : ""}</div>
        <span class="num ${gap > 0 ? "" : "meta"}">${gap > 0 ? usd(-gap) : "no gap"}</span></div>`}</td>
      <td class="money">${f.transactions}</td>
      <td><span class="sa-badge ${cls}" title="${esc(f.calendar_year.meaning ?? "")}">${cls === "warn" ? icon("duplicate", "sm") + " " : ""}${text}</span></td></tr>`;
  }).join("");
}

const PRESETS = [20, 25, 30];
let ed = null; // the open set-aside editor: { creator, rate (whole %), out: Set<platform>, totalNet, byPlatform, api }

function heroBase(sa, qLabel) {
  return `<div class="sub" data-sa-base>to set aside: ${usd(sa.base)} ${qLabel}net${sa.excluded.size ? " (some platforms left out)" : ""} × the
      <button class="rate-chip" data-rate-edit aria-expanded="false">${Math.round(sa.rate * 100)}% ${icon("sliders", "sm")}</button> you chose</div>`;
}

function heroAmount(sa, qLabel) {
  return `<div class="sa-fig num" data-sa-amt>${usd(sa.amount)}</div>${heroBase(sa, qLabel)}`;
}

function editor(sa, plats) {
  const r = Math.round(sa.rate * 100);
  return `<div class="sa-rateedit" data-editor hidden>
    <div class="row">
      <div class="sa-seg on-dark" data-presets>${PRESETS.map(x => `<button data-r="${x}" class="${x === r ? "on" : ""}">${x}%</button>`).join("")}</div>
      <input type="range" class="sa-range" data-rate min="0" max="50" step="1" value="${Math.min(50, r)}" aria-label="Set-aside rate">
      <label class="sa-rateinput"><input data-rate-in inputmode="decimal" value="${r}" aria-label="Custom set-aside rate">%</label>
    </div>
    <div class="row meta-row"><span>${COPY.SETTINGS_PROMISE}</span><button class="link" data-reset ${sa.custom ? "" : "hidden"}>Reset to ${Math.round(sa.defaultRate * 100)}%</button></div>
    <details class="advanced"${sa.excluded.size ? " open" : ""}><summary>Advanced · platforms in the base</summary>
      <ul class="sa-togglelist">${plats.map(p => `<li data-p="${p.platform}" class="${sa.excluded.has(p.platform) ? "off" : ""}"><span class="tl-name"><i class="sa-pdot" style="background:${pcol(p.platform).fill}"></i>${esc(p.label)}</span><span class="amt">${usd(p.net)}</span><button class="sa-toggle ${sa.excluded.has(p.platform) ? "" : "on"}" aria-label="Include ${esc(p.label)}"></button></li>`).join("")}</ul>
    </details>
  </div>`;
}

export async function render(ctx) {
  const [T, R] = await Promise.all([
    get("tax-items", { creator: ctx.creator, period: ctx.period }),
    get("report", { creator: ctx.creator, period: ctx.period }),
  ]);
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
    ...issues.map(i => `${i.platform} ${i.record?.ref ?? ""}: no ${i.currency} rate for ${i.date}. It stays out until the rate is added.`),
  ];
  const T4 = F.totals_for_platforms_with_forms;
  const plats = [...R.by_platform].sort((a, b) => b.net - a.net);
  const sa = setAside(ctx.creator, { totalNet: T.total_net_usd, byPlatform: plats, api: T.set_aside });
  const qLabel = ctx.period.includes("Q") ? `Q${ctx.period.slice(-1)} ` : "";
  ed = { creator: ctx.creator, rate: Math.round(sa.rate * 100), out: new Set(sa.excluded), totalNet: T.total_net_usd, byPlatform: plats, api: T.set_aside, qLabel };

  return top(ctx, "Tax", label) + `
  <div class="sa-grid">
    ${warnCard(ctx, issues)}
    <section class="sa-hero c8 tax-hero">
      <div>
        <div class="title">${COPY.TAX_HERO}${sa.amount > 0 ? mascot("celebrate", "title-mascot") : ""}</div>
        ${ctx.me.tax_country === "US" ? "" : `<div class="sub" style="margin-top:8px">${icon("globe", "sm")} ${COUNTRY[ctx.me.tax_country] ?? ctx.me.tax_country} tax home: US estimated-tax dates don’t apply.</div>`}
        <div class="amount">
          ${heroAmount(sa, qLabel)}
        </div>
        ${editor(sa, plats)}
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
      <div class="head"><h2>${COPY.FORMS_HEADLINE}</h2><span class="sa-ribbon">${icon("info", "sm")} Simulated forms · real 1099-K threshold</span></div>
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

// Live recompute of the hero while the rate or the included platforms change; saved per browser.
function update(root) {
  ed.rate = Math.max(0, Math.min(100, Math.round(ed.rate)));
  saveRate(ed.creator, ed.rate === Math.round(ed.api.rate * 100) ? null : ed.rate / 100);
  saveExcluded(ed.creator, ed.out);
  const sa = setAside(ed.creator, { totalNet: ed.totalNet, byPlatform: ed.byPlatform, api: ed.api });
  const amt = root.querySelector(".tax-hero .amount");
  amt.querySelector("[data-sa-amt]").textContent = usd(sa.amount);
  amt.querySelector("[data-sa-base]").outerHTML = heroBase(sa, ed.qLabel);
  bindChip(root);
  root.querySelector("[data-rate-edit]").setAttribute("aria-expanded", "true");
  root.querySelector("[data-rate]").value = Math.min(50, ed.rate);
  root.querySelector("[data-rate-in]").value = ed.rate;
  root.querySelectorAll("[data-presets] button").forEach(b => b.classList.toggle("on", +b.dataset.r === ed.rate));
  root.querySelector("[data-reset]").hidden = !sa.custom;
}

function bindChip(root) {
  root.querySelector("[data-rate-edit]")?.addEventListener("click", () => {
    const box = root.querySelector("[data-editor]");
    box.hidden = !box.hidden;
    root.querySelector("[data-rate-edit]").setAttribute("aria-expanded", String(!box.hidden));
  });
}

export function mount(ctx, root) {
  root.querySelector("[data-checklist]")?.addEventListener("click", ev => {
    const box = ev.target.closest(".box");
    if (box) box.classList.toggle("done");
  });
  bindChip(root);
  const set = v => { ed.rate = Number(v) || 0; update(root); };
  root.querySelector("[data-rate]")?.addEventListener("input", e => set(e.target.value));
  root.querySelector("[data-rate-in]")?.addEventListener("change", e => set(e.target.value));
  root.querySelectorAll("[data-presets] button").forEach(b => b.addEventListener("click", () => set(b.dataset.r)));
  root.querySelector("[data-reset]")?.addEventListener("click", () => { ed.out.clear(); root.querySelectorAll(".sa-togglelist li").forEach(li => { li.classList.remove("off"); li.querySelector(".sa-toggle").classList.add("on"); }); set(Math.round(ed.api.rate * 100)); });
  root.querySelectorAll(".sa-togglelist .sa-toggle").forEach(t => t.addEventListener("click", () => {
    const li = t.closest("li");
    t.classList.toggle("on");
    li.classList.toggle("off");
    ed.out[t.classList.contains("on") ? "delete" : "add"](li.dataset.p);
    update(root);
  }));
  if (ctx.query.get("edit")) root.querySelector("[data-rate-edit]")?.click();
}

export { platformKey };

// Kit 18 / 18b: the sheet that adds or edits one manual income or expense. It opens over the page,
// validates like the server (amount above 0 with up to 2 decimals, a date that isn't in the future,
// a source for income, a category for an expense) and saves to this browser (lib/entries.js). The note
// is stored with the entry here and never sent.
import { V14 } from "./copy.js";
import { esc, icon, localDay } from "./format.js";
import { CATEGORIES, CURRENCIES, current, newEntryId, remove, upsert } from "./entries.js";

const SYMBOL = { USD: "$", CNY: "¥", EUR: "€", GBP: "£" };
const MAX_LABEL = 60;

// Any past date up to today (the server rejects future dates).
function dateRange() {
  return { min: "2000-01-01", max: localDay() };
}

function defaultDate(ctx, { min, max }) {
  const m = ctx.period?.includes("Q") ? null : ctx.period;
  if (!m) return max;
  const last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const end = `${m}-${String(last).padStart(2, "0")}`;
  return end > max ? max : end < min ? min : end;
}

// Income sources already used, most used first (chips under the Source field).
function knownSources(entries) {
  const n = new Map();
  for (const e of entries) if (e.kind === "income" && e.source) n.set(e.source, (n.get(e.source) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s).slice(0, 8);
}

function sheet(ctx, entry, sources, range) {
  const e = entry ?? { kind: "income", date: defaultDate(ctx, range), currency: ctx.cur ?? "USD", amount: "", source: "", category: "", note: "" };
  const field = (label, ctl, help = "", cls = "") => `<label class="sa-field ${cls}"><span class="label">${label}</span>${ctl}${help ? `<span class="help">${help}</span>` : ""}</label>`;
  return `<div class="sa-drawer-backdrop" data-close></div>
  <aside class="sa-drawer entry-sheet" role="dialog" aria-modal="true" aria-label="${entry ? V14.ENTRY_EDIT_TITLE : V14.ENTRY_ADD_TITLE}">
    <div class="head"><div><h2>${entry ? V14.ENTRY_EDIT_TITLE : V14.ENTRY_ADD_TITLE}</h2><p>${V14.ENTRY_SUB}</p></div>
      <button type="button" class="sa-btn secondary sm" data-close>Close</button></div>
    <div class="sa-seg wide" role="radiogroup" aria-label="Kind">
      <button type="button" role="radio" data-kind="income" class="${e.kind === "income" ? "on" : ""}" aria-checked="${e.kind === "income"}">${icon("up", "sm")} ${V14.TYPE_INCOME}</button>
      <button type="button" role="radio" data-kind="expense" class="${e.kind === "expense" ? "on" : ""}" aria-checked="${e.kind === "expense"}">${icon("down", "sm")} Expense</button>
    </div>
    <div class="sa-row2">
      ${field("Date", `<span class="ctl">${icon("calendar", "sm")}<input type="date" name="date" min="${range.min}" max="${range.max}" value="${esc(e.date)}" required></span>`)}
      ${field("Currency", `<span class="ctl"><select name="currency">${CURRENCIES.map(c => `<option ${c === e.currency ? "selected" : ""}>${c}</option>`).join("")}</select><span class="end">${icon("chevron", "sm")}</span></span>`)}
    </div>
    ${field("Amount", `<span class="ctl big"><span class="pre" data-sym>${SYMBOL[e.currency] ?? ""}</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${e.amount === "" ? "" : esc(Number(e.amount).toFixed(2))}"></span>`)}
    <div data-for="income" ${e.kind === "income" ? "" : "hidden"}>
      ${field("Source", `<span class="ctl"><input name="source" maxlength="${MAX_LABEL}" autocomplete="off" value="${esc(e.kind === "income" ? e.source ?? "" : "")}" placeholder="Tutoring"></span>`, V14.SOURCE_HINT)}
      ${sources.length ? `<div class="sa-cats" style="margin-top:10px">${sources.map(s => `<button type="button" class="sa-chip" data-source="${esc(s)}"><i class="sa-pdot own"></i>${esc(s)}</button>`).join("")}
        <button type="button" class="sa-chip" data-source="">${icon("plus", "sm")} ${V14.NEW_SOURCE}</button></div>` : ""}
    </div>
    <div data-for="expense" ${e.kind === "expense" ? "" : "hidden"}>
      <div class="sa-field"><span class="label">Category</span>
        <div class="sa-cats" role="radiogroup" aria-label="Category">${CATEGORIES.map(c => `<button type="button" role="radio" class="sa-chip ${c === e.category ? "on" : ""}" aria-checked="${c === e.category}" data-category="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <span class="help">${V14.CATEGORY_HINT}</span></div>
      ${field("Paid to (optional)", `<span class="ctl"><input name="payee" maxlength="${MAX_LABEL}" autocomplete="off" value="${esc(e.kind === "expense" ? e.source ?? "" : "")}" placeholder="Adobe Creative Cloud"></span>`, "", "gap")}
    </div>
    ${field(V14.NOTE_LABEL, `<textarea class="ctl area" name="note" rows="3">${esc(e.note ?? "")}</textarea>`, `${icon("lock", "sm")} ${V14.NOTE_PRIVACY}`)}
    <p class="sa-form-err" data-err role="alert" hidden></p>
    <div class="foot">
      <button type="button" class="sa-btn primary" data-save>${icon(entry ? "check" : "plus", "sm")} <span data-save-label></span></button>
      ${entry ? `<button type="button" class="sa-btn danger" data-delete>${icon("trash", "sm")} ${V14.DELETE_ENTRY}</button>` : ""}
      <button type="button" class="sa-btn ghost" data-close>Cancel</button>
    </div>
  </aside>`;
}

// Opens the sheet; `id` edits that entry. Saving or deleting re-renders the page.
export async function openEntry(ctx, id = null) {
  const { entries } = await current(ctx);
  const entry = id ? entries.find(e => e.id === id) ?? null : null;
  if (id && !entry) return;
  const range = dateRange(ctx);
  const wrap = document.createElement("div");
  wrap.className = "sa-drawer-wrap";
  wrap.innerHTML = sheet(ctx, entry, knownSources(entries), range);
  document.body.append(wrap);
  const $ = sel => wrap.querySelector(sel);
  let kind = entry?.kind ?? "income", category = entry?.kind === "expense" ? entry.category : "";

  const label = () => { $("[data-save-label]").textContent = entry ? V14.SAVE_ENTRY : kind === "income" ? V14.ADD_INCOME : V14.ADD_EXPENSE; };
  const setKind = k => {
    kind = k;
    wrap.querySelectorAll("[data-kind]").forEach(b => { b.classList.toggle("on", b.dataset.kind === k); b.setAttribute("aria-checked", b.dataset.kind === k); });
    wrap.querySelectorAll("[data-for]").forEach(el => { el.hidden = el.dataset.for !== k; });
    label();
  };
  const onKey = ev => { if (ev.key === "Escape") close(); };
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  const fail = msg => { const p = $("[data-err]"); p.textContent = msg; p.hidden = false; };

  label();
  document.addEventListener("keydown", onKey);
  wrap.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", close));
  wrap.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => setKind(b.dataset.kind)));
  wrap.querySelectorAll("[data-category]").forEach(b => b.addEventListener("click", () => {
    category = b.dataset.category;
    wrap.querySelectorAll("[data-category]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
  }));
  wrap.querySelectorAll("[data-source]").forEach(b => b.addEventListener("click", () => {
    const input = $("input[name=source]");
    input.value = b.dataset.source;
    input.focus();
  }));
  $("select[name=currency]").addEventListener("change", ev => { $("[data-sym]").textContent = SYMBOL[ev.target.value] ?? ""; });
  setTimeout(() => $("input[name=amount]").focus(), 0);

  $("[data-save]").addEventListener("click", async () => {
    const date = $("input[name=date]").value, amountText = $("input[name=amount]").value.replace(/[,\s]/g, "");
    const amount = Number(amountText);
    if (!/^\d+(\.\d{1,2})?$/.test(amountText) || !(amount > 0) || amount > 10_000_000) return fail(V14.ERR_AMOUNT);
    if (!date || date > range.max || date < range.min) return fail(V14.ERR_DATE);
    const source = (kind === "income" ? $("input[name=source]") : $("input[name=payee]")).value.trim().replace(/\s+/g, " ");
    if (kind === "income" && !source) return fail(V14.ERR_SOURCE);
    if (kind === "expense" && !category) return fail(V14.ERR_CATEGORY);
    const note = $("textarea[name=note]").value.trim();
    const next = { id: entry?.id ?? newEntryId(), kind, date, amount, currency: $("select[name=currency]").value,
                   source: source || null, ...(kind === "expense" ? { category } : {}), ...(note ? { note } : {}) };
    await upsert(ctx, next);
    close();
    ctx.refresh();
  });
  $("[data-delete]")?.addEventListener("click", async () => {
    await remove(ctx, entry.id);
    close();
    ctx.refresh();
  });
}

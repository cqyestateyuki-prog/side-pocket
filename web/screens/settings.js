// Settings & privacy (kit 12 and 12b): tax home, display currency and set-aside rate for Your data;
// where each kind of data goes; backup export and load; Delete all my data behind a confirmation.
import { COPY, YOURS } from "../lib/copy.js";
import { esc, icon, localDay } from "../lib/format.js";
import { clearPrefs, setMode } from "../lib/prefs.js";
import * as store from "../lib/store.js";
import { shortLabel } from "../lib/statements.js";
import { invalidate } from "../lib/personal.js";
import { loadBackup } from "./mydata.js";

const X = YOURS;
const LABEL = { bilibili: "Bilibili", youtube: "YouTube", twitch: "Twitch", patreon: "Patreon", upwork: "Upwork", fiverr: "Fiverr", freelancer: "Freelancer.com", contra: "Contra" };
const HOMES = [["US", "United States", X.TAXHOME_HELP_US], ["CN", "China", X.TAXHOME_HELP_CN], ["BOTH", "Both", X.TAXHOME_HELP_BOTH]];
const PRESETS = [20, 25, 30];
const MAX_RATE = 60; // the API accepts 0 to 60%

// The privacy copy names a label like "Upwork · acct ••4821"; show one of the person's own when there is one.
function exampleLabel(data) {
  const f = data.files.find(x => x.kind === "statement" && x.accounts?.length);
  return f ? `${LABEL[f.platform] ?? f.platform} · ${shortLabel(f.accounts[0])}` : null;
}

function dialog(ctx) {
  const files = ctx.data.files.filter(f => f.kind === "statement").length;
  const records = ctx.data.summary?.records ?? 0;
  return `<div class="sa-scrim" data-dialog-close></div>
  <div class="sa-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" data-dialog>
    <div class="ic">${icon("trash")}</div>
    <h2 id="dlg-title">${X.DIALOG_TITLE}</h2>
    <p>${X.DIALOG_BODY}</p>
    <ul><li><span>Statements</span><span>${files} file${files === 1 ? "" : "s"}</span></li><li><span>Records</span><span>${records}</span></li><li><span>Settings</span><span>tax home, currency, set-aside rate</span></li></ul>
    <div class="actions"><button type="button" class="sa-btn danger solid" data-delete-confirm>${icon("trash", "sm")} Delete all my data</button><button type="button" class="sa-btn secondary" data-export>${icon("download", "sm")} Export backup first</button><button type="button" class="sa-btn ghost cancel" data-dialog-close>Cancel</button></div>
  </div>`;
}

export async function render(ctx) {
  const s = ctx.data.settings;
  const rate = Math.round(s.set_aside_rate * 100);
  const home = HOMES.find(h => h[0] === s.tax_home) ?? HOMES[0];
  const label = exampleLabel(ctx.data);
  const nowrap = t => `<span style="white-space:nowrap">${esc(t)}</span>`;
  const intro = label ? X.PRIVACY_INTRO.replace(/Upwork · acct ••\d{4}/, label) : X.PRIVACY_INTRO;
  return `
  <div class="sa-top"><div><h1>Settings &amp; privacy</h1><p>${X.SETTINGS_SUB}</p></div><div class="right">${ctx.whoPill(ctx)}</div></div>
  <div class="sa-grid">
    ${ctx.data.persistent ? "" : `<div class="c12 sa-note warn">${icon("alert", "sm")}<span>${X.STORAGE_OFF}</span></div>`}
    <div class="c12" data-notes></div>
    <section class="sa-card sa-settings c6">
      <div class="head" style="margin:10px 0 2px"><h2>Settings</h2></div>
      <div class="row"><h3>${icon("globe", "sm")} Tax home</h3>
        <div class="ctl"><div class="sa-seg">${HOMES.map(([k, l]) => `<button type="button" data-home="${k}" class="${k === home[0] ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <p>${home[2]}</p></div>
      <div class="row"><h3>${icon("fx", "sm")} Display currency</h3><div class="ctl"><div class="sa-seg">${[["USD", "$ USD"], ["CNY", "¥ CNY"]].map(([c, l]) => `<button type="button" data-cur="${c}" class="${c === ctx.cur ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <p>${X.CURRENCY_HELP}</p></div>
      <div class="row"><h3>${icon("sliders", "sm")} Set-aside rate</h3>
        <div class="ctl"><div class="sa-seg">${PRESETS.map(r => `<button type="button" data-rate="${r}" class="${r === rate ? "on" : ""}">${r}%</button>`).join("")}</div><label class="sa-rateinput"><input data-rate-in inputmode="decimal" value="${rate}" aria-label="Set-aside rate">%</label></div>
        <p>${COPY.SETTINGS_PROMISE}</p></div>
    </section>
    <section class="sa-hero c6" style="min-height:0">
      <div class="lead" style="display:flex;gap:8px;align-items:center">${icon("shield", "sm")} Privacy center</div>
      <div class="sub" style="margin-top:10px;font-size:15px;line-height:1.5;max-width:520px;color:var(--sa-on-forest)">${esc(intro)}</div>
      <ul class="sa-datamap">
        <li><span class="ic">${icon("monitor", "sm")}</span><div><b>This browser</b><span>${X.MAP_BROWSER}</span></div></li>
        <li><span class="ic">${icon("server", "sm")}</span><div><b>Side Atlas server</b><span>${X.MAP_SERVER}</span></div></li>
        <li><span class="ic">${icon("ask", "sm")}</span><div><b>Ask Atlas</b><span>${X.MAP_AI.replace("{label}", nowrap(label ?? "Upwork · acct ••4821"))}</span></div></li>
        <li><span class="ic">${icon("steps", "sm")}</span><div><b>PRISM traces</b><span>${X.MAP_PRISM}</span></div></li>
        <li><span class="ic">${icon("fx", "sm")}</span><div><b>Exchange rates</b><span>${X.MAP_FX}</span></div></li>
      </ul>
    </section>
    <section class="sa-card c12" style="padding:20px 0">
      <div class="sa-dataact">
        <div><h3>Export backup</h3><p>${X.EXPORT_HELP}</p>
          <div class="btns"><button type="button" class="sa-btn secondary" data-export>${icon("download", "sm")} Export backup</button>
            <button type="button" class="sa-btn ghost sm" data-load>${icon("upload", "sm")} Load a backup</button></div>
          <input type="file" data-backup accept=".json,application/json" hidden></div>
        <div><h3>Delete all my data</h3><p>${X.DELETE_HELP}</p><button type="button" class="sa-btn danger" data-delete>${icon("trash", "sm")} Delete all my data</button></div>
      </div>
    </section>
  </div>`;
}

// One JSON file: the relabelled statements (never the originals), the salt and labels that keep
// account labels stable, and the settings.
export async function exportBackup() {
  const d = await store.load();
  const backup = {
    app: "side-atlas", kind: "backup", version: 1, exported_at: new Date().toISOString(),
    salt: d.salt, labels: d.labels, settings: d.settings,
    files: d.files.map(({ name, kind, platform, accounts, content, reason }) => ({ name, kind, platform, accounts, content: content ?? null, reason })),
  };
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" })),
    download: `side-atlas-backup-${localDay()}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openDialog(ctx, root) {
  root.insertAdjacentHTML("beforeend", `<div data-dialog-wrap>${dialog(ctx)}</div>`);
  const wrap = root.querySelector("[data-dialog-wrap]");
  const onKey = ev => { if (ev.key === "Escape") close(); };
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  document.addEventListener("keydown", onKey);
  wrap.querySelectorAll("[data-dialog-close]").forEach(el => el.addEventListener("click", close));
  wrap.querySelector("[data-export]").addEventListener("click", exportBackup);
  wrap.querySelector("[data-delete-confirm]").addEventListener("click", async () => {
    await store.clear();
    clearPrefs();
    setMode("yours");
    invalidate();
    close();
    location.hash = "#mydata";
  });
  wrap.querySelector("[data-delete-confirm]").focus();
}

export function mount(ctx, root) {
  const save = async patch => { await store.saveSettings(patch); ctx.refresh(); };
  root.querySelectorAll("[data-home]").forEach(b => b.addEventListener("click", () => save({ tax_home: b.dataset.home })));
  root.querySelectorAll("[data-cur]").forEach(b => b.addEventListener("click", () => save({ currency: b.dataset.cur })));
  root.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => save({ set_aside_rate: +b.dataset.rate / 100 })));
  root.querySelector("[data-rate-in]")?.addEventListener("change", e => {
    const v = Math.max(0, Math.min(MAX_RATE, Math.round(Number(e.target.value) || 0)));
    save({ set_aside_rate: v / 100 });
  });
  root.querySelectorAll(".sa-dataact [data-export]").forEach(b => b.addEventListener("click", exportBackup));
  const input = root.querySelector("[data-backup]");
  root.querySelector("[data-load]")?.addEventListener("click", () => input.click());
  input?.addEventListener("change", async () => {
    if (input.files[0]) await loadBackup(input.files[0]);
    location.hash = "#mydata";
  });
  root.querySelector("[data-delete]")?.addEventListener("click", () => openDialog(ctx, root));
  if (ctx.query.get("delete")) openDialog(ctx, root);
}

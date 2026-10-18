// One dropdown for every picker (kit v1.4.1 · #65): period, display currency, creator and the ledger's
// column filters. The trigger keeps its own look (header pill, creator pill or table header) and the
// menu is drawn by Side Pocket, so the open list matches the app instead of the system menu.
import { esc, icon } from "./format.js";

// options: [{ value, label, icon?: html, meta?: text, group?: text }]
export function dropdown({ name, label, trigger, options, value, cls = "sa-pick", align = "end" }) {
  let group = null;
  const items = options.map(o => {
    const head = o.group && o.group !== group ? `<div class="grp">${esc((group = o.group))}</div>` : "";
    const on = o.value === value;
    return `${head}<button type="button" role="option" class="opt${on ? " on" : ""}" data-value="${esc(o.value)}" aria-selected="${on}">`
      + `${o.icon ?? ""}<span class="t">${esc(o.label)}${o.meta ? `<small>${esc(o.meta)}</small>` : ""}</span>${on ? icon("check", "sm tick") : ""}</button>`;
  }).join("");
  return `<div class="sa-dd" data-dd="${name}" data-align="${align}"><button type="button" class="${cls}" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}">${trigger}${icon("chevron", "sm chev")}</button>`
    + `<div class="sa-menu" role="listbox" aria-label="${esc(label)}" hidden>${items}</div></div>`;
}

// Wires the dropdowns under `root` whose name has a handler; each is bound once.
export function bindDropdowns(root, handlers) {
  root.querySelectorAll(".sa-dd").forEach(dd => {
    const pick = handlers[dd.dataset.dd];
    if (!pick || dd.dataset.bound) return;
    dd.dataset.bound = "1";
    const btn = dd.querySelector(":scope > button"), menu = dd.querySelector(".sa-menu");
    const opts = () => [...menu.querySelectorAll(".opt")];
    const outside = e => { if (!dd.contains(e.target)) close(); };
    const onScroll = e => { if (!menu.contains(e.target)) close(); };
    function place() {
      // Fixed to the viewport so a short table or a scrolling card never clips the menu.
      const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
      const left = dd.dataset.align === "start" ? r.left : r.right - w;
      const below = r.bottom + 6 + h <= innerHeight - 8;
      menu.style.left = `${Math.max(8, Math.min(left, innerWidth - w - 8))}px`;
      menu.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
    }
    function open() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      place();
      (menu.querySelector(".opt.on") ?? opts()[0])?.focus({ preventScroll: true });
      document.addEventListener("pointerdown", outside, true);
      addEventListener("scroll", onScroll, true);
      addEventListener("resize", close);
    }
    function close() {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      removeEventListener("scroll", onScroll, true);
      removeEventListener("resize", close);
    }
    btn.addEventListener("click", () => (menu.hidden ? open() : close()));
    menu.addEventListener("click", e => {
      const o = e.target.closest(".opt");
      if (!o) return;
      close();
      if (!o.classList.contains("on")) pick(o.dataset.value);
    });
    dd.addEventListener("keydown", e => {
      if (e.key === "Escape" || e.key === "Tab") { if (!menu.hidden && e.key === "Escape") btn.focus(); close(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (menu.hidden) { open(); return; }
      const list = opts(), i = list.indexOf(document.activeElement);
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    });
  });
}

// Formatting and small render helpers shared by every screen.

const SYMBOL = { USD: "$", CNY: "¥", EUR: "€", GBP: "£" };

const money = (v, symbol) =>
  (v < 0 ? "−" : "") + symbol + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usd = v => money(v, "$");
export const cur = (v, currency) => money(v, SYMBOL[currency] ?? `${currency} `);
export const pct = v => (v * 100).toFixed(1) + "%";
export const icon = (name, cls = "") => `<svg class="sa-icon ${cls}"><use href="#sa-i-${name}"/></svg>`;
export const monthName = m => new Date(m + "-01T12:00:00").toLocaleString("en-US", { month: "long" });
export const monthShort = m => new Date(m + "-01T12:00:00").toLocaleString("en-US", { month: "short" });
export const dateLong = d => new Date(d + "T12:00:00").toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const dateShort = d => new Date(d + "T12:00:00").toLocaleString("en-US", { month: "short", day: "numeric" });
export const mmdd = d => d.slice(5).replace("-", "/");

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Platform colours come from the kit tokens: fill / tint / text-on-white.
export const pcol = key => ({ fill: `var(--sa-p-${key})`, tint: `var(--sa-p-${key}-tint)`, text: `var(--sa-p-${key}-text)` });
// The platform's own mark (assets/platforms, Simple Icons CC0 in brand colours) in front of its name.
export const PLATFORMS = ["bilibili", "youtube", "twitch", "patreon", "upwork", "fiverr", "freelancer", "contra"];
export const picon = key => PLATFORMS.includes(key) ? `<img class="sa-picon" src="assets/platforms/${key}.svg" alt="" width="16" height="16">` : `<i class="sa-pdot" style="background:${pcol(key).fill}"></i>`;

export const PLATFORM_KEY = {
  "Bilibili": "bilibili", "B站": "bilibili", "YouTube": "youtube", "Twitch": "twitch", "Patreon": "patreon",
  "Upwork": "upwork", "Fiverr": "fiverr", "Freelancer.com": "freelancer", "Contra": "contra",
};

export function periodLabel(period) {
  if (/^\d{4}-Q\d$/.test(period)) {
    const q = +period.slice(6);
    const span = [["January", "March"], ["April", "June"], ["July", "September"], ["October", "December"]][q - 1];
    return `Q${q} ${period.slice(0, 4)} · ${span[0]} to ${span[1]}`;
  }
  return `${monthName(period)} ${period.slice(0, 4)}`;
}

export const daysBetween = (from, to) =>
  Math.round((new Date(to + "T12:00:00") - new Date(from + "T12:00:00")) / 86400000);

// Quarter of a month ("2026-08" → "2026-Q3"); a quarter stays itself.
export const quarterOf = p => /Q\d$/.test(p) ? p : `${p.slice(0, 4)}-Q${Math.floor((+p.slice(5, 7) - 1) / 3) + 1}`;
// Today in the viewer's own time zone (deadlines count from here, not from UTC).
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const weekday = d => new Date(d + "T12:00:00").toLocaleString("en-US", { weekday: "short" });

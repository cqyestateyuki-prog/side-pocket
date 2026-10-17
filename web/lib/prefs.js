// Per-viewer set-aside preferences kept in the browser: the rate and which platforms count toward
// the base. Storage can be unavailable (private mode, blocked site data), so every access is
// wrapped and the app works without it.

const RATE = creator => `sideatlas.setAsideRate.${creator}`;
const EXCLUDED = creator => `sideatlas.setAsideExcluded.${creator}`;

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* not persisted */ }
}

// The rate this viewer chose for a creator (0–1), or null for the creator's default.
export function chosenRate(creator) {
  const v = read(RATE(creator));
  const r = v == null ? NaN : Number(v);
  return Number.isFinite(r) && r >= 0 && r <= 1 ? r : null;
}
export const saveRate = (creator, rate) => write(RATE(creator), rate == null ? null : String(rate));

export function excluded(creator) {
  try { return new Set(JSON.parse(read(EXCLUDED(creator)) ?? "[]")); } catch { return new Set(); }
}
export const saveExcluded = (creator, set) => write(EXCLUDED(creator), set.size ? JSON.stringify([...set]) : null);

const round2 = v => Math.round(v * 100 + 1e-9) / 100;

// The set-aside to display. With the defaults it is the API's own figure; otherwise the chosen
// rate applied to the net of the included platforms, rounded half-up to cents like the ledger.
export function setAside(creator, { totalNet, byPlatform, api }) {
  const r = chosenRate(creator) ?? api.rate;
  const out = excluded(creator);
  const left = byPlatform.filter(p => out.has(p.platform));
  const base = left.length ? round2(byPlatform.filter(p => !out.has(p.platform)).reduce((s, p) => s + p.net, 0)) : totalNet;
  const custom = left.length > 0 || Math.abs(r - api.rate) > 1e-9;
  return { amount: custom ? round2(base * r) : api.amount, rate: r, base, custom, excluded: out, defaultRate: api.rate };
}

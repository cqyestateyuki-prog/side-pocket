// Manual income and expenses, and the monthly goal, for whichever account is open. Both live in this
// browser: My uploads keeps them with its statements (lib/store.js), the sample account Moon Spirit
// starts from her fictional list (GET /api/entries) and keeps this browser's changes under its own key.
// Notes are stored here only; requests carry entries without them (sendableEntry).
import { get } from "./api.js";
import * as store from "./store.js";
import { invalidate } from "./personal.js";

export const CATEGORIES = ["Software & subscriptions", "Equipment", "Internet & phone", "Education", "Travel", "Marketing", "Other"];
export const CURRENCIES = ["USD", "CNY", "EUR", "GBP"];

const demoKey = creator => `demo:${creator}`;

// The sample account's starting list, as served (fixture ids are kept so edits replace them in place).
const fixture = creator => get("entries", { creator });

// { entries, goal } for the open account.
export async function current(ctx) {
  if (ctx.yours) return { entries: ctx.data.entries ?? [], goal: ctx.data.settings.monthly_goal ?? null };
  const [fx, mine] = await Promise.all([fixture(ctx.creator), store.getKey(demoKey(ctx.creator))]);
  return { entries: mine?.entries ?? fx.entries, goal: mine && "goal" in mine ? mine.goal : fx.monthly_goal ?? null };
}

// What the sample account sends with POST /api/{overview,ledger,report}, or null while nothing changed.
export async function demoBody(creator) {
  const mine = await store.getKey(demoKey(creator));
  if (!mine) return null;
  const fx = await fixture(creator);
  const entries = (mine.entries ?? fx.entries).map(({ note, ...e }) => e);
  return { entries, monthly_goal: "goal" in mine ? mine.goal : fx.monthly_goal ?? null };
}

async function saveDemo(ctx, patch) {
  const key = demoKey(ctx.creator);
  const mine = (await store.getKey(key)) ?? {};
  if ("entries" in patch && !("entries" in mine)) mine.entries = (await fixture(ctx.creator)).entries;
  await store.putKey(key, { ...mine, ...patch });
}

export async function saveEntries(ctx, entries) {
  if (ctx.yours) { await store.save({ entries }); invalidate(); }
  else await saveDemo(ctx, { entries });
}

export async function saveGoal(ctx, goal) {
  if (ctx.yours) { await store.saveSettings({ monthly_goal: goal }); invalidate(); }
  else await saveDemo(ctx, { goal });
}

export async function upsert(ctx, entry) {
  const { entries } = await current(ctx);
  const i = entries.findIndex(e => e.id === entry.id);
  const next = i >= 0 ? entries.map(e => (e.id === entry.id ? entry : e)) : [...entries, entry];
  await saveEntries(ctx, next);
}

export async function remove(ctx, id) {
  const { entries } = await current(ctx);
  await saveEntries(ctx, entries.filter(e => e.id !== id));
}

export const newEntryId = () => `u-${store.newId()}`;

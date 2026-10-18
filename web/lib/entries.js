// Manual income and expenses, and the monthly goal. Both live in this browser with the statements
// (lib/store.js). Notes are stored here only; requests carry entries without them (sendableEntry).
import * as store from "./store.js";
import { invalidate } from "./personal.js";

export const CATEGORIES = ["Software & subscriptions", "Equipment", "Internet & phone", "Education", "Travel", "Marketing", "Other"];
export const CURRENCIES = ["USD", "CNY", "EUR", "GBP"];

// { entries, goal } for the account.
export async function current(ctx) {
  return { entries: ctx.data.entries ?? [], goal: ctx.data.settings.monthly_goal ?? null };
}

export async function saveEntries(ctx, entries) {
  await store.save({ entries });
  invalidate();
}

export async function saveGoal(ctx, goal) {
  await store.saveSettings({ monthly_goal: goal });
  invalidate();
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

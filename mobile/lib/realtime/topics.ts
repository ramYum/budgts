import type { Topic } from "../api/invalidate";

/**
 * The tables the web's <RealtimeRefresh> watches, and the screens (topics) a change in each one refreshes:
 * - `transactions`: the dashboard layout, every page (a background bank sync landing rows);
 * - `budgets`: Home and Budgets;
 * - `savings_goals`, `savings_contributions`: Goals.
 */
export const TABLE_TOPICS = {
  transactions: ["transactions", "home", "budgets", "accounts"],
  budgets: ["budgets", "home"],
  savings_goals: ["goals", "home"],
  savings_contributions: ["goals", "home"],
} as const satisfies Record<string, readonly Topic[]>;

export type RealtimeTable = keyof typeof TABLE_TOPICS;

/** The topics a set of watched tables refreshes, once each. */
export function topicsFor(tables: readonly RealtimeTable[]): Topic[] {
  return [...new Set<Topic>(tables.flatMap((t) => TABLE_TOPICS[t]))];
}

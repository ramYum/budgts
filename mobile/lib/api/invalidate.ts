import { useSyncExternalStore } from "react";

/**
 * A tiny "this data changed" signal between screens. A form that saves a transaction calls `invalidate("transactions", "budgets",
 * "home")`; every list that shows that data reads `useVersion(topic)` as part of its fetch key and so reloads on its own — no
 * screen has to know who else displays the data, and nothing is left stale after a save.
 */
export type Topic = "transactions" | "budgets" | "accounts" | "home";

const versions = new Map<Topic, number>();
const listeners = new Set<() => void>();

export const getVersion = (topic: Topic): number => versions.get(topic) ?? 0;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidate(...topics: Topic[]): void {
  for (const t of topics) versions.set(t, getVersion(t) + 1);
  for (const l of [...listeners]) l();
}

/** The topic's current version — changes whenever it is invalidated, so it can be part of a fetch key. */
export function useVersion(topic: Topic): number {
  return useSyncExternalStore(subscribe, () => getVersion(topic), () => 0);
}

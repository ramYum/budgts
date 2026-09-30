/**
 * Small auth facts that must outlive the process (lib/auth/reauth-guard.ts, lib/auth/return-intent.ts): a re-sign-in
 * can leave the app for the mail app or Google's Custom Tab, and Android may kill it meanwhile. Kept in the device's
 * secure storage (lib/auth/secure-kv.ts, set by AuthProvider); an injected store keeps these modules testable.
 * Never tokens: only a user id, a path and a time.
 */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

let store: KeyValueStore | null = null;

export function setAuthStore(next: KeyValueStore | null): void {
  store = next;
}

/** Writes (or, with null, removes) one fact. A storage failure leaves the in-memory copy guarding this run. */
export async function persist(key: string, value: unknown): Promise<void> {
  if (!store) return;
  try {
    if (value === null) await store.removeItem(key);
    else await store.setItem(key, JSON.stringify(value));
  } catch {
    // the memory copy still guards this process
  }
}

/** Reads one fact back, or null when it's absent, unreadable or the storage failed. */
export async function restore(key: string): Promise<unknown> {
  if (!store) return null;
  try {
    const raw = await store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** `{ <field>: string, at: number }`, the shape both facts are stored in. */
export function isStamped<K extends string>(v: unknown, fields: readonly K[]): v is Record<K, string> & { at: number } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.at === "number" && fields.every((f) => typeof o[f] === "string" && (o[f] as string).length > 0);
}

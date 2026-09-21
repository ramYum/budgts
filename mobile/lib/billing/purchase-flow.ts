/**
 * The purchase FLOW: how the app moves from "tap Start your 14-day free trial" to a confirmed entitlement — with the
 * SERVER as the only authority on whether the user has Premium.
 *
 * The rule this file exists to enforce: a store sheet reporting success is NOT entitlement. After any purchase (and on
 * restore, and whenever the app starts or returns to the foreground) the flow asks the server to reconcile with the
 * billing provider and believes ONLY the answer. The store's local result, React state, AsyncStorage and any "purchase
 * succeeded" screen never grant access. If the server does not (yet) confirm, the outcome is `not_confirmed` — never
 * `premium` — and it can be re-checked at any time, including after the app was closed mid-purchase.
 *
 * The flow is a plain object over injected ports (purchases, server calls, sleep), so it is fully unit-tested without a
 * device, a store, or a network.
 */
import type { EntitlementView } from "./contract";
import type { EntitlementLoad, RefreshResult } from "./load-entitlement";
import type { Offer, PurchasesClient } from "./purchases";

export type FlowState =
  | { kind: "idle" }
  | { kind: "purchasing" }
  /** The store reported success; the server has not confirmed it yet. Premium is NOT granted. */
  | { kind: "confirming" }
  /** Server-confirmed. The only state that carries access. */
  | { kind: "premium"; entitlement: EntitlementView }
  /** The store said "purchased" but the server does not (yet) show an entitlement. Retry with `recover()`. */
  | { kind: "not_confirmed"; entitlement: EntitlementView | null }
  /** Awaiting store-side approval. No access yet. */
  | { kind: "pending" }
  | { kind: "cancelled" }
  | { kind: "nothing_to_restore" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export interface FlowDeps {
  purchases: PurchasesClient;
  /** `GET /api/billing/entitlement` */
  fetchEntitlement: () => Promise<EntitlementLoad>;
  /** `POST /api/billing/entitlement/refresh` (the server reconciles with the provider). */
  refreshEntitlement: () => Promise<RefreshResult>;
  sleep?: (ms: number) => Promise<void>;
  /** How many times to ask the server after a purchase before reporting `not_confirmed` (webhook/provider lag). */
  confirmAttempts?: number;
  confirmDelayMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createPurchaseFlow(deps: FlowDeps) {
  const sleep = deps.sleep ?? defaultSleep;
  const attempts = deps.confirmAttempts ?? 4;
  const delay = deps.confirmDelayMs ?? 2000;

  /** Asks the server, up to `tries` times, whether the user now has Premium. Returns the server's verdict only. */
  async function confirm(tries: number): Promise<EntitlementView | null> {
    let last: EntitlementView | null = null;
    for (let i = 0; i < tries; i++) {
      const r = await deps.refreshEntitlement();
      if (r.status === "ok") {
        last = r.entitlement;
        if (r.entitlement.hasPremium) return r.entitlement;
      }
      if (i < tries - 1) await sleep(delay);
    }
    return last;
  }

  return {
    /** Identify the SDK with our user id. Call once the user is signed in. */
    configure: (userId: string) => deps.purchases.configure(userId),

    /** The current server-side truth (never a local guess). */
    async load(): Promise<EntitlementLoad> {
      return deps.fetchEntitlement();
    },

    /** The store's localized offers. Empty until products/keys exist. */
    async offers(): Promise<Offer[]> {
      try {
        return await deps.purchases.getOffers();
      } catch {
        return [];
      }
    },

    /**
     * Start the purchase sheet for an offer (the "Start your 14-day free trial" action). Access is granted only if the
     * SERVER confirms afterwards.
     */
    async startPurchase(offer: Offer): Promise<FlowState> {
      if (!deps.purchases.isAvailable()) return { kind: "unavailable" };
      // Already entitled on the server (e.g. bought on another device): do not start a second purchase.
      const before = await deps.fetchEntitlement();
      if (before.status === "ready" && before.entitlement.hasPremium) return { kind: "premium", entitlement: before.entitlement };

      const outcome = await deps.purchases.purchase(offer);
      switch (outcome.kind) {
        case "cancelled":
          return { kind: "cancelled" };
        case "pending":
          return { kind: "pending" };
        case "failed":
          return { kind: "error", message: outcome.message };
        case "purchased": {
          const verdict = await confirm(attempts);
          return verdict?.hasPremium ? { kind: "premium", entitlement: verdict } : { kind: "not_confirmed", entitlement: verdict };
        }
      }
    },

    /**
     * Re-check with the server. Use it on app start, on returning to the foreground, after login, and for a `pending`
     * or `not_confirmed` purchase. This is what recovers a purchase whose app session was closed mid-flight: the
     * server reconciles from the provider, so the entitlement appears without any local memory of the purchase.
     */
    async recover(): Promise<FlowState> {
      const verdict = await confirm(1);
      return verdict?.hasPremium ? { kind: "premium", entitlement: verdict } : { kind: "idle" };
    },

    /** "Restore purchases": ask the store to re-sync this device, then let the SERVER decide. */
    async restore(): Promise<FlowState> {
      if (!deps.purchases.isAvailable()) return { kind: "unavailable" };
      try {
        await deps.purchases.restore();
      } catch {
        // A failed store restore does not stop us asking the server: the provider may already know the purchase.
      }
      const verdict = await confirm(2);
      return verdict?.hasPremium ? { kind: "premium", entitlement: verdict } : { kind: "nothing_to_restore" };
    },

    logOut: () => deps.purchases.logOut(),
  };
}

export type PurchaseFlow = ReturnType<typeof createPurchaseFlow>;

/**
 * The device-side PURCHASE port. Everything a screen or the purchase flow knows about the store SDK is this small,
 * provider-neutral interface; RevenueCat (V1) is one implementation behind it (./revenuecat-purchases.ts), and tests
 * use a fake. Nothing above this line imports a billing SDK.
 *
 * Crucially, none of these calls can grant Premium. `purchase()` reports what the STORE SHEET did on this device;
 * whether the user has Premium is decided by the server (see purchase-flow.ts).
 */

export type Plan = "monthly" | "annual";

/** A purchasable offer as the store presents it: localized, authoritative price and terms. */
export type Offer = {
  productId: string;
  /** The store-localized price string, exactly as the store shows it (e.g. "$9.99"). Prefer this over any server price. */
  priceString: string;
  plan: Plan | null;
  /** The free-trial length the STORE will apply, when the offer carries one. The UI copy says 7; this lets it be checked. */
  trialDays: number | null;
  /** Opaque handle the implementation needs to start the purchase. */
  handle: unknown;
};

export type PurchaseOutcome =
  /** The store sheet completed. This is NOT entitlement: the server must still confirm. */
  | { kind: "purchased" }
  | { kind: "cancelled" }
  /** Awaiting approval (e.g. Ask to Buy, deferred payment). Access must not be granted yet. */
  | { kind: "pending" }
  | { kind: "failed"; message: string };

export interface PurchasesClient {
  /** False when the store SDK is not configured (no API key / products yet). Every other call is then a safe no-op. */
  isAvailable(): boolean;
  /** Identifies the SDK with OUR user id (RevenueCat's app_user_id = the Supabase user id). */
  configure(userId: string): Promise<void>;
  getOffers(): Promise<Offer[]>;
  purchase(offer: Offer): Promise<PurchaseOutcome>;
  /** Asks the store to re-sync this device's purchases. Does not grant anything by itself. */
  restore(): Promise<void>;
  logOut(): Promise<void>;
}

/** Where the user manages or cancels a subscription. Store-owned pages; no Budgts UI can cancel a store subscription. */
export function manageSubscriptionUrl(store: "apple" | "google" | null, packageName = "com.budgts.app"): string {
  if (store === "google") return `https://play.google.com/store/account/subscriptions?package=${packageName}`;
  return "https://apps.apple.com/account/subscriptions";
}

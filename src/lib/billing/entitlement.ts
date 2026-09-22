/**
 * The provider-neutral ENTITLEMENT model and the ONE decision the rest of the product may ask:
 * `hasPremium(entitlement, now)`.
 *
 * Nothing in here (or anywhere outside src/lib/billing/revenuecat/) knows a provider's event vocabulary. Screens
 * and API routes see only `EntitlementView` / `hasPremium`, so a future web billing provider is a new adapter that
 * emits the same domain events, not a change to any feature.
 *
 * The stored `state` is the last thing a provider told us; it is NEVER trusted past its `accessUntil`. A missed
 * expiration webhook therefore cannot grant Premium forever: `effectiveStatus` downgrades a live state whose
 * access window has closed, at read time, with no background job required.
 *
 * Design authority: docs/specs/2026-09-21-v1-monetization-design.md.
 */

export type EntitlementState = "none" | "trialing" | "active" | "grace" | "expired" | "revoked";
export type Store = "apple" | "google";

/** States in which access is granted (provided `accessUntil` is still in the future). */
export const ENTITLED_STATES: readonly EntitlementState[] = ["trialing", "active", "grace"];

/** What a renewal will cost, as the provider reported it. Minor units + ISO 4217. Never invented. */
export interface Price {
  amount: number;
  currency: string;
}

/** Everything an entitlement row holds except its owner. The reducer maps one of these to the next. */
export interface EntitlementFields {
  state: EntitlementState;
  provider: string | null;
  store: Store | null;
  productId: string | null;
  providerCustomerId: string | null;
  willRenew: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  accessUntil: Date | null;
  lastProviderEventAt: Date | null;
  lastReconciledAt: Date | null;
  renewalPriceAmount: number | null;
  renewalPriceCurrency: string | null;
  reminderForTrialEndsAt: Date | null;
  reminderClaimedAt: Date | null;
  reminderSentAt: Date | null;
}

export interface Entitlement extends EntitlementFields {
  userId: string;
}

/** A user who has never had anything: the state every account starts in (no row is needed to mean this). */
export function emptyEntitlement(): EntitlementFields {
  return {
    state: "none",
    provider: null,
    store: null,
    productId: null,
    providerCustomerId: null,
    willRenew: false,
    trialStartedAt: null,
    trialEndsAt: null,
    accessUntil: null,
    lastProviderEventAt: null,
    lastReconciledAt: null,
    renewalPriceAmount: null,
    renewalPriceCurrency: null,
    reminderForTrialEndsAt: null,
    reminderClaimedAt: null,
    reminderSentAt: null,
  };
}

/** The stored state with the clock applied: a live state whose access window has closed is `expired`. */
export function effectiveStatus(e: Pick<EntitlementFields, "state" | "accessUntil">, now: Date): EntitlementState {
  if (ENTITLED_STATES.includes(e.state) && !(e.accessUntil && e.accessUntil.getTime() > now.getTime())) return "expired";
  return e.state;
}

/**
 * THE access decision. True only while a provider-confirmed trial / paid period / grace period is still running.
 * Takes the entitlement (or null for a user with no row) — never a client-supplied flag.
 */
export function hasPremium(e: Pick<EntitlementFields, "state" | "accessUntil"> | null | undefined, now: Date = new Date()): boolean {
  if (!e) return false;
  return ENTITLED_STATES.includes(effectiveStatus(e, now));
}

/**
 * The stable, provider-neutral shape mobile and web consume. Deliberately not the raw row: no reminder
 * bookkeeping, no provider ids, no ordering timestamps — just what a screen needs to decide what to show.
 */
export interface EntitlementView {
  /** The only field access decisions may key off. */
  hasPremium: boolean;
  status: EntitlementState;
  isTrial: boolean;
  /** Renews (or converts from trial to paid) automatically unless cancelled. */
  willRenew: boolean;
  trialEndsAt: string | null;
  /** When access ends if nothing renews. ISO 8601. */
  accessUntil: string | null;
  productId: string | null;
  store: Store | null;
  /**
   * The account has never had a trial or a purchase, so the "Start your 7-day free trial" offer applies.
   * A hint only: the STORE is the authority on trial eligibility and shows its own sheet.
   */
  canStartTrial: boolean;
  /** What renewal costs when the provider told us; the app should prefer the store's localized price. */
  renewal: { amount: number; currency: string } | null;
}

/** A renewal price, formatted for display (e.g. "$9.99"). Amounts are integer minor units; never invented here. */
export function formatPrice(p: Price): string {
  const exp = (() => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      return 2;
    }
  })();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(p.amount / 10 ** exp);
  } catch {
    return `${(p.amount / 10 ** exp).toFixed(exp)} ${p.currency}`;
  }
}

export function toEntitlementView(e: EntitlementFields | null | undefined, now: Date = new Date()): EntitlementView {
  const f = e ?? emptyEntitlement();
  const status = effectiveStatus(f, now);
  const entitled = ENTITLED_STATES.includes(status);
  return {
    hasPremium: entitled,
    status,
    isTrial: status === "trialing",
    willRenew: entitled && f.willRenew,
    trialEndsAt: f.trialEndsAt ? f.trialEndsAt.toISOString() : null,
    accessUntil: f.accessUntil ? f.accessUntil.toISOString() : null,
    productId: f.productId,
    store: f.store,
    canStartTrial: f.state === "none" && f.trialStartedAt === null,
    renewal:
      f.renewalPriceAmount !== null && f.renewalPriceCurrency !== null
        ? { amount: f.renewalPriceAmount, currency: f.renewalPriceCurrency }
        : null,
  };
}

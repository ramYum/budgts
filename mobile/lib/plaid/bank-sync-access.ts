import type { ApiFailure } from "../api/request";

/**
 * The bank-sync gate as the app sees it: once billing is configured, connecting, reconnecting or refreshing a bank
 * needs a subscription, and the server answers 402 `premium_required` (src/lib/billing/gate.ts,
 * `requireBankSyncAccess`). The sentence is the web's (src/lib/billing/bank-sync-access.ts), checked verbatim by
 * tests/unit/mobile-bank-sync-message.test.ts.
 */
export const BANK_SYNC_SUBSCRIPTION_MESSAGE = "Bank sync needs a Budgts subscription.";

/** The gate's refusal: the request was fine, the account has no subscription. */
export function isBankSyncRefusal(failure: Pick<ApiFailure, "status">): boolean {
  return failure.status === 402;
}

/**
 * Where Connect a bank / Reconnect hand a refusal on, after showing BANK_SYNC_SUBSCRIPTION_MESSAGE: the Phase 4 paywall
 * opens here. Optional on purpose: without it the message is the whole answer and the button works again.
 */
export type OnSubscriptionRequired = () => void;

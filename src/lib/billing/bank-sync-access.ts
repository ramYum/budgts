/**
 * What a client says when the bank-sync gate (`requireBankSyncAccess`, src/lib/billing/gate.ts) refuses: connecting,
 * reconnecting or refreshing a bank needs a subscription. Pure and client-safe; the web components and the native app
 * (mobile/lib/plaid/bank-sync-access.ts mirrors it) share the words.
 */
export const BANK_SYNC_SUBSCRIPTION_MESSAGE = "Bank sync needs a Budgts subscription.";

/** The gate's answer: 402 `premium_required`. */
export function isBankSyncRefusal(res: Pick<Response, "status">): boolean {
  return res.status === 402;
}

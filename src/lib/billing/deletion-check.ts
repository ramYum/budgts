/**
 * The billing check the account-deletion flow runs BEFORE choosing Path A (hard delete) or Path B (retain history).
 *
 * Why it exists: deleting a Budgts account never cancels an Apple/Google subscription, and the local ledger can lag the
 * store — a charge whose webhook has not been processed yet is invisible to `hasMonetizationHistory`. Choosing Path A
 * on that stale view would hard-delete a paying customer's record moments before the charge lands. So the provider is
 * asked first, and the local records are only a fallback:
 *
 *   provider reachable   -> hasCharge = the provider shows a PAID period (normal / intro). A free trial (`trial`) is not
 *                           a charge. hasFutureAccess = a store subscription may still be running.
 *   provider unreachable -> CONSERVATIVE: if this account ever had a store subscription locally, presume a charge
 *                           (Path B keeps only an inert, de-identified row); if it never did, presume none.
 *   not configured       -> the local ledger alone decides (deployments without billing keep working unchanged).
 *
 * Deletion is never BLOCKED by any of this — only steered. Server-only; never trusts anything the client says.
 */
import type { BillingCheck, BillingVerdict } from "@/lib/account/delete-account";
import type { BillingConfig } from "./config";
import type { Db } from "./db";
import { fetchSubscriber, subscriberBillingFacts } from "./revenuecat/reconcile";

export interface BillingCheckDeps {
  db: Db;
  config: BillingConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

/** What the local entitlement row alone says (a read; tolerant of the table not existing yet). */
async function localSignals(db: Db, userId: string): Promise<{ everHadStoreSubscription: boolean; liveNow: boolean }> {
  try {
    const [row] = await db.query<{ ever: boolean; live: boolean }>(
      `select (product_id is not null or store is not null or trial_started_at is not null) as ever,
              (state in ('trialing','active','grace') and access_until > now()) as live
         from entitlements where user_id = $1`,
      [userId],
    );
    return { everHadStoreSubscription: !!row?.ever, liveNow: !!row?.live };
  } catch {
    return { everHadStoreSubscription: false, liveNow: false }; // 0022 not applied here: nothing local to consult
  }
}

export function createBillingCheck(deps: BillingCheckDeps): BillingCheck {
  return async (userId): Promise<BillingVerdict> => {
    const now = (deps.now ?? (() => new Date()))();
    const local = await localSignals(deps.db, userId);
    if (!deps.config.secretApiKey) {
      return { hasCharge: false, storeSubscriptionMayBeActive: local.liveNow, source: "not_configured" };
    }
    try {
      const body = await fetchSubscriber(userId, { secretApiKey: deps.config.secretApiKey, fetchImpl: deps.fetchImpl });
      const facts = subscriberBillingFacts(body, now, deps.config.environment);
      if (facts.kind === "facts") {
        return { hasCharge: facts.hasPaidPeriod, storeSubscriptionMayBeActive: facts.hasFutureAccess || local.liveNow, source: "provider" };
      }
    } catch {
      /* fall through to the conservative local answer */
    }
    return { hasCharge: local.everHadStoreSubscription, storeSubscriptionMayBeActive: local.liveNow || local.everHadStoreSubscription, source: "local_fallback" };
  };
}

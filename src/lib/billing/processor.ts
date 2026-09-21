/**
 * Applies ONE verified, mapped provider event. Everything an event does — the log entry, the ledger write for a real
 * charge, the entitlement transition — happens in a SINGLE database transaction, so it commits together or not at
 * all. A crash or error mid-way leaves nothing half-applied; the provider redelivers (RevenueCat retries any non-200)
 * and the same event is applied cleanly.
 *
 * Guarantees:
 *  - DEDUPE. The unique provider event id makes a duplicate delivery a no-op once handled; a delivery whose earlier
 *    attempt failed is reprocessed.
 *  - ORDER. The reducer refuses to move state backward; a charge is still ledgered regardless of arrival order,
 *    because money that moved is a fact.
 *  - ENVIRONMENT FENCE. An event from the other store environment (sandbox in production, or the reverse) is
 *    QUARANTINED: logged, never applied.
 *  - NO PHANTOM OWNERS. An event naming no known account is logged and ignored; it can never create data.
 *  - DELETION. For an account whose deletion has started, a charge is still ledgered (real money) but the
 *    entitlement is not (re)created — deletion must not be undone by a late webhook.
 *  - LOUD FAILURE. A real charge we cannot represent (unknown plan, ownership conflict) FAILS the event rather than
 *    dropping money silently.
 */
import type { Db } from "./db";
import { emptyEntitlement } from "./entitlement";
import { LedgerConflictError, recordPaidCharge, syncSubscriptionStatus } from "./ledger";
import { reduce } from "./reducer";
import type { MappedRevenueCatEvent } from "./revenuecat/map";
import { PROVIDER } from "./revenuecat/map";
import { accountIsDeleting, finishEvent, lockEntitlement, recordEvent, recordFailure, saveEntitlement, userExists, type EventIdentity } from "./store";

export type ProcessOutcome =
  | { status: "processed"; applied: boolean; charged: boolean; duplicateCharge: boolean; entitlementSkipped?: "account_deleting" }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string }
  | { status: "quarantined"; reason: string }
  | { status: "failed"; error: string };

export interface ProcessDeps {
  db: Db;
  /** Which store environment THIS deployment accepts (see config.ts). */
  environment: "production" | "sandbox";
  now?: () => Date;
}

function identity(m: MappedRevenueCatEvent, userId: string | null): EventIdentity {
  return {
    provider: PROVIDER,
    providerEventId: m.providerEventId,
    eventType: m.eventType,
    userId,
    appUserId: m.appUserId,
    environment: m.environment,
    occurredAt: m.occurredAt,
    payload: m.redactedPayload,
  };
}

export async function processRevenueCatEvent(deps: ProcessDeps, m: MappedRevenueCatEvent): Promise<ProcessOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  try {
    return await deps.db.transaction(async (tx): Promise<ProcessOutcome> => {
      const known = m.userId ? await userExists(tx, m.userId) : false;
      const ownerId = known ? m.userId : null;
      const rec = await recordEvent(tx, identity(m, ownerId));
      if (rec.alreadyHandled) return { status: "duplicate" };

      if (m.environment !== deps.environment) {
        const reason = `${m.environment} event refused by a ${deps.environment} deployment`;
        await finishEvent(tx, rec.id, { status: "quarantined", error: reason });
        return { status: "quarantined", reason };
      }
      if (!ownerId) {
        const reason = m.userId ? "no such account (deleted or never existed)" : "event names no Budgts user";
        await finishEvent(tx, rec.id, { status: "ignored", error: reason });
        return { status: "ignored", reason };
      }
      if (m.chargeProblem) throw new LedgerConflictError(m.chargeProblem);

      // 1) Money first: a charge is a fact whatever the order it arrives in, and whatever the account's state.
      let charged = false;
      let duplicateCharge = false;
      if (m.charge) {
        const w = await recordPaidCharge(tx, ownerId, m.charge);
        charged = !w.duplicate;
        duplicateCharge = w.duplicate;
      }

      // 2) Access.
      if (!m.domain) {
        await finishEvent(tx, rec.id, { status: "ignored", error: m.ignoredReason });
        return { status: "ignored", reason: m.ignoredReason ?? "no access effect" };
      }
      if (await accountIsDeleting(tx, ownerId)) {
        await finishEvent(tx, rec.id, { status: "processed", internalType: m.domain.type, error: "account deleting: entitlement not updated" });
        return { status: "processed", applied: false, charged, duplicateCharge, entitlementSkipped: "account_deleting" };
      }
      const current = await lockEntitlement(tx, ownerId);
      const { userId: _owner, ...currentFields } = current;
      void _owner;
      const result = reduce({ ...emptyEntitlement(), ...currentFields }, m.domain, now);
      if (result.reason !== "stale") {
        await saveEntitlement(tx, ownerId, result.next);
        await syncSubscriptionStatus(tx, m.platformSubscriptionId, result.next.state);
      }
      await finishEvent(tx, rec.id, { status: "processed", internalType: m.domain.type, error: result.reason === "stale" ? "stale: older than the last applied event" : null });
      return { status: "processed", applied: result.applied, charged, duplicateCharge };
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown error";
    // The transaction rolled back. Leave a visible failure record so it is diagnosable, and let the caller answer 5xx
    // so the provider redelivers. (Best effort: if even this fails, the redelivery still finds nothing half-done.)
    try {
      const known = m.userId ? await userExists(deps.db, m.userId) : false;
      await recordFailure(deps.db, identity(m, known ? m.userId : null), error);
    } catch {
      /* the event is simply absent; the provider will redeliver */
    }
    return { status: "failed", error };
  }
}

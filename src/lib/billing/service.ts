/**
 * Application services over the billing domain: read an entitlement, refresh it from the provider, and reconcile
 * stale ones on a schedule. Routes stay thin and call these; they hold no billing rules themselves.
 *
 * Identity here is always a `userId` the CALLER has already authenticated (a verified session or Bearer token). It is
 * never read from a request body.
 */
import type { Db } from "./db";
import { emptyEntitlement, toEntitlementView, type EntitlementView } from "./entitlement";
import type { DomainEvent } from "./events";
import { reduce } from "./reducer";
import { fetchSubscriber, subscriberToSnapshot } from "./revenuecat/reconcile";
import { PROVIDER } from "./revenuecat/map";
import type { BillingConfig } from "./config";
import { accountIsDeleting, finishEvent, loadEntitlement, lockEntitlement, recordEvent, saveEntitlement, userExists } from "./store";
import { syncSubscriptionStatus } from "./ledger";

/** The user's entitlement as a stable view-model. A user with no row has simply never had anything. */
export async function getEntitlementView(db: Db, userId: string, now: Date = new Date()): Promise<EntitlementView> {
  return toEntitlementView(await loadEntitlement(db, userId), now);
}

export type RefreshStatus = "refreshed" | "throttled" | "no_provider_record" | "unavailable" | "environment_mismatch" | "provider_error" | "account_deleting";
export interface RefreshResult {
  status: RefreshStatus;
  view: EntitlementView;
}

/** Do not hit the provider more often than this for one user (the app may call refresh on every foreground). */
export const REFRESH_MIN_INTERVAL_MS = 30_000;

export interface RefreshDeps {
  db: Db;
  config: BillingConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

/** Applies a provider snapshot to the user's entitlement, audited as a billing event. Idempotent per fetch instant. */
async function applySnapshot(deps: RefreshDeps, userId: string, event: DomainEvent, platformSubscriptionId: string | null): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  await deps.db.transaction(async (tx) => {
    if (!(await userExists(tx, userId)) || (await accountIsDeleting(tx, userId))) return;
    const rec = await recordEvent(tx, {
      provider: PROVIDER,
      providerEventId: `reconcile:${userId}:${now.getTime()}`,
      eventType: "RECONCILE_SNAPSHOT",
      userId,
      appUserId: userId,
      environment: deps.config.environment,
      occurredAt: event.occurredAt,
      payload: { source: "reconcile", type: event.type },
    });
    if (rec.alreadyHandled) return;
    const current = await lockEntitlement(tx, userId);
    const { userId: _u, ...fields } = current;
    void _u;
    const r = reduce({ ...emptyEntitlement(), ...fields }, event, now);
    if (r.reason !== "stale") {
      await saveEntitlement(tx, userId, r.next);
      await syncSubscriptionStatus(tx, platformSubscriptionId, r.next.state);
    }
    await finishEvent(tx, rec.id, { status: "processed", internalType: "snapshot", error: r.reason === "stale" ? "stale: newer state already applied" : null });
  });
}

/**
 * Asks the provider for its current view of THIS user and reconciles the entitlement to it — the repair path for a
 * missed webhook and the "restore purchases / refresh after purchase" path. The server decides; whatever the client
 * believes about its purchase is irrelevant.
 */
export async function refreshEntitlement(deps: RefreshDeps, userId: string): Promise<RefreshResult> {
  const now = (deps.now ?? (() => new Date()))();
  const view = async () => getEntitlementView(deps.db, userId, now);
  if (!deps.config.secretApiKey) return { status: "unavailable", view: await view() };
  if (await accountIsDeleting(deps.db, userId)) return { status: "account_deleting", view: await view() };

  const current = await loadEntitlement(deps.db, userId);
  if (current?.lastReconciledAt && now.getTime() - current.lastReconciledAt.getTime() < REFRESH_MIN_INTERVAL_MS) {
    return { status: "throttled", view: await view() };
  }

  let body: unknown;
  try {
    body = await fetchSubscriber(userId, { secretApiKey: deps.config.secretApiKey, fetchImpl: deps.fetchImpl });
  } catch {
    return { status: "provider_error", view: await view() };
  }

  const outcome = subscriberToSnapshot(body, now, deps.config.environment);
  switch (outcome.kind) {
    case "snapshot":
      await applySnapshot(deps, userId, outcome.event, outcome.platformSubscriptionId);
      return { status: "refreshed", view: await view() };
    case "none":
      // The provider has no purchase for this user: nothing to change, but record that we checked.
      await deps.db.query(`update entitlements set last_reconciled_at = $2 where user_id = $1`, [userId, now]);
      return { status: "no_provider_record", view: await view() };
    case "environment_mismatch":
      return { status: "environment_mismatch", view: await view() };
    case "unparseable":
      return { status: "provider_error", view: await view() };
  }
}

export interface ReconcileSweepResult {
  checked: number;
  refreshed: number;
  problems: number;
}

/** Scheduled repair: re-check entitled users that have not been reconciled recently. Bounded per run. */
export async function reconcileStale(deps: RefreshDeps, opts: { limit?: number; staleAfterMs?: number } = {}): Promise<ReconcileSweepResult> {
  const now = (deps.now ?? (() => new Date()))();
  const staleBefore = new Date(now.getTime() - (opts.staleAfterMs ?? 6 * 3_600_000));
  const rows = await deps.db.query<{ user_id: string }>(
    `select user_id from entitlements
      where state in ('trialing','active','grace') and (last_reconciled_at is null or last_reconciled_at < $1)
      order by last_reconciled_at asc nulls first limit $2`,
    [staleBefore, opts.limit ?? 50],
  );
  let refreshed = 0;
  let problems = 0;
  for (const { user_id } of rows) {
    const r = await refreshEntitlement(deps, user_id);
    if (r.status === "refreshed" || r.status === "no_provider_record") refreshed++;
    else if (r.status === "provider_error" || r.status === "environment_mismatch") problems++;
  }
  return { checked: rows.length, refreshed, problems };
}

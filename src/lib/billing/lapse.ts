/**
 * Lapse: removing a user's Plaid bank connections after their subscription or free trial ended unpaid.
 *
 * Why: Plaid bills a monthly fee for every Item while a valid access token exists, and `/item/remove` is the only
 * way to end it (launch spec §9: "A lapsed or unpaid trial pauses sync, then removes the user's Plaid Items after a
 * grace period").
 *
 * Who is lapsed, precisely: the user HAS an entitlements row, `hasPremium` is false, and access ended (`access_until`)
 * at least LAPSE_GRACE_DAYS ago. A user with NO row is never touched: that is every pre-launch account and the
 * owner's accounts awaiting the Phase 4 grandfather grant. A row that never had an access window (`access_until`
 * null) is never touched either.
 *
 * How: each Item goes through the ONE shared disconnect (`src/server/plaid/disconnect.ts`) in strict mode, which keeps
 * the ledger (transactions are detached, never deleted) and keeps the local Item whenever Plaid does not confirm the
 * removal, so the next scheduled run retries it. Runs only from the billing schedule (`/api/billing/reconcile/due`)
 * and only when this deployment's billing provider is configured.
 */
import type { Db } from "./db";
import { hasPremium, type EntitlementFields } from "./entitlement";

/** Days after access ends before the user's bank connections are removed. */
export const LAPSE_GRACE_DAYS = 7;
const GRACE_MS = LAPSE_GRACE_DAYS * 86_400_000;

type AccessFields = Pick<EntitlementFields, "state" | "accessUntil">;

/** True when this entitlement lapsed unpaid at least LAPSE_GRACE_DAYS ago. No row (null) is never lapsed. */
export function isLapsedPastGrace(e: AccessFields | null | undefined, now: Date): boolean {
  if (!e) return false;
  if (hasPremium(e, now)) return false;
  if (!e.accessUntil) return false;
  return now.getTime() - e.accessUntil.getTime() >= GRACE_MS;
}

/**
 * Whether Connected banks explains that the user's banks were removed: a removal is on record, the user still has no
 * Premium, and the removal belongs to the CURRENT lapse (a removal older than the latest access end belongs to an
 * earlier period the user has since paid for).
 */
export function showsLapseRemovalNotice(
  e: (AccessFields & { bankConnectionsRemovedAt: Date | null }) | null | undefined,
  now: Date,
): boolean {
  if (!e?.bankConnectionsRemovedAt) return false;
  if (hasPremium(e, now)) return false;
  return !e.accessUntil || e.bankConnectionsRemovedAt.getTime() >= e.accessUntil.getTime();
}

/** One Item's removal, as the shared disconnect reports it. */
export type RemoveItemResult = { ok: true } | { ok: false; status: number; error: string };
export type RemoveItem = (userId: string, itemId: string) => Promise<RemoveItemResult>;

export interface LapseSweepDeps {
  db: Db;
  now?: () => Date;
  removeItem: RemoveItem;
}

export interface LapseSweepResult {
  /** Items selected for removal this run. */
  checked: number;
  removed: number;
  /** Items Plaid (or the database) did not confirm as removed: kept, logged, and retried on the next run. */
  failed: number;
}

type CandidateRow = { user_id: string; item_id: string; state: EntitlementFields["state"]; access_until: Date | null };

/**
 * Removes the Plaid Items of every user lapsed past the grace window. Bounded per run (`limit` Items) and idempotent:
 * a removed Item no longer exists, so a re-run selects only what is left. A no-op when no lapsed user has an Item.
 */
export async function removeLapsedBankConnections(deps: LapseSweepDeps, opts: { limit?: number } = {}): Promise<LapseSweepResult> {
  const now = (deps.now ?? (() => new Date()))();
  const cutoff = new Date(now.getTime() - GRACE_MS);
  // The server connection bypasses RLS: the join scopes every Item to its own user. A user whose account deletion has
  // started is left to the deletion, which removes their Items itself (strictly) before anything else.
  const rows = await deps.db.query<CandidateRow>(
    `select e.user_id, pi.item_id, e.state, e.access_until
       from entitlements e
       join plaid_items pi on pi.user_id = e.user_id
      where e.access_until is not null and e.access_until <= $1
        and not exists (select 1 from account_deletions d where d.user_id = e.user_id)
      order by e.access_until asc, pi.item_id asc
      limit $2`,
    [cutoff, opts.limit ?? 50],
  );

  const byUser = new Map<string, string[]>();
  for (const r of rows) {
    // The query's date bound already implies this; the access decision itself stays in one place (`hasPremium`).
    if (!isLapsedPastGrace({ state: r.state, accessUntil: r.access_until }, now)) continue;
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.item_id]);
  }

  let checked = 0;
  let removed = 0;
  let failed = 0;
  for (const [userId, itemIds] of byUser) {
    // Re-read right before acting: a purchase or restore that landed since the select keeps the user's banks.
    const [fresh] = await deps.db.query<{ state: EntitlementFields["state"]; access_until: Date | null }>(
      `select state, access_until from entitlements where user_id = $1`,
      [userId],
    );
    if (!fresh || !isLapsedPastGrace({ state: fresh.state, accessUntil: fresh.access_until }, now)) continue;

    for (const itemId of itemIds) {
      checked++;
      let result: RemoveItemResult;
      try {
        result = await deps.removeItem(userId, itemId);
      } catch (err) {
        result = { ok: false, status: 500, error: err instanceof Error ? err.name : "unknown error" };
      }
      // 404: the Item was already gone locally (the user or a concurrent run disconnected it). Nothing left to remove.
      if (result.ok || result.status === 404) {
        removed++;
        if (result.ok) {
          await deps.db.query(`update entitlements set bank_connections_removed_at = $2, updated_at = now() where user_id = $1`, [userId, now]);
        }
        continue;
      }
      failed++;
      // The shared disconnect has already logged Plaid's error (describePlaidError). The Item is kept, so the next
      // scheduled run retries it. `outcome` is disconnect's own fixed message, never a raw error.
      const outcome = result.error;
      console.error("[billing] lapse: could not remove a bank connection; kept for the next run", { itemId, outcome });
    }
  }
  return { checked, removed, failed };
}

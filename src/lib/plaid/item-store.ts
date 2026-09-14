/**
 * Reads/writes on `plaid_items` for the service-role paths (webhook, cron,
 * sync). Every function takes an injected Drizzle db and always filters by the
 * resolved `user_id` where one is known — design §22.
 */
import { and, eq, lt, or, sql } from "drizzle-orm";
import type { PlaidDb } from "./sync-store";
import { plaidItems } from "@/lib/db/schema";

export type PlaidItemStatus = "active" | "login_required" | "pending_expiration" | "revoked" | "error";

export interface PlaidItemRecord {
  id: string;
  userId: string;
  itemId: string;
  /** Plaid's institution id (e.g. `ins_116484`) — gates Advancial replay
   * containment (replay-containment.ts) to that one confirmed institution. */
  institutionId: string | null;
  accessTokenEnc: string;
  transactionsCursor: string | null;
  status: PlaidItemStatus;
}

const COLS = {
  id: plaidItems.id,
  userId: plaidItems.userId,
  itemId: plaidItems.itemId,
  institutionId: plaidItems.institutionId,
  accessTokenEnc: plaidItems.accessTokenEnc,
  transactionsCursor: plaidItems.transactionsCursor,
  status: plaidItems.status,
};

/** Resolve a Plaid `item_id` to its owning row (item_id is globally unique). */
export async function findItemByPlaidItemId(db: PlaidDb, itemId: string): Promise<PlaidItemRecord | null> {
  const [row] = await db.select(COLS).from(plaidItems).where(eq(plaidItems.itemId, itemId)).limit(1);
  return row ? (row as PlaidItemRecord) : null;
}

/** Same, but scoped to a user — for request-time reconnect (update mode). */
export async function findUserItem(
  db: PlaidDb,
  userId: string,
  itemId: string,
): Promise<PlaidItemRecord | null> {
  const [row] = await db
    .select(COLS)
    .from(plaidItems)
    .where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId)))
    .limit(1);
  return row ? (row as PlaidItemRecord) : null;
}

/** Items the poller should sync now: flagged, or not synced since `staleBefore`. */
export async function findItemsToSync(
  db: PlaidDb,
  opts: { staleBefore?: Date; onlyActive?: boolean } = {},
): Promise<PlaidItemRecord[]> {
  const conds = [
    opts.staleBefore
      ? or(eq(plaidItems.needsSync, true), lt(plaidItems.lastSyncedAt, opts.staleBefore))
      : eq(plaidItems.needsSync, true),
  ];
  if (opts.onlyActive !== false) conds.push(eq(plaidItems.status, "active"));
  const rows = await db.select(COLS).from(plaidItems).where(and(...conds));
  return rows as PlaidItemRecord[];
}

export async function markItemNeedsSync(db: PlaidDb, itemId: string): Promise<void> {
  await db
    .update(plaidItems)
    .set({ needsSync: true, lastWebhookAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(plaidItems.itemId, itemId));
}

export async function setItemStatus(
  db: PlaidDb,
  itemId: string,
  status: PlaidItemStatus,
  errorCode: string | null = null,
): Promise<void> {
  await db
    .update(plaidItems)
    .set({ status, errorCode, updatedAt: sql`now()` })
    .where(eq(plaidItems.itemId, itemId));
}

/** Bump the failure counter; flip to `error` once it crosses `threshold`. */
export async function recordSyncFailure(
  db: PlaidDb,
  itemId: string,
  errorCode: string,
  threshold = 5,
): Promise<void> {
  await db
    .update(plaidItems)
    .set({
      syncFailures: sql`${plaidItems.syncFailures} + 1`,
      errorCode,
      status: sql`case when ${plaidItems.syncFailures} + 1 >= ${threshold} then 'error'::plaid_item_status else ${plaidItems.status} end`,
      updatedAt: sql`now()`,
    })
    .where(eq(plaidItems.itemId, itemId));
}

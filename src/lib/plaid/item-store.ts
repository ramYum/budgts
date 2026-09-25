/**
 * Reads/writes on `plaid_items` for the service-role paths (webhook, cron,
 * sync). Every function takes an injected Drizzle db and always filters by the
 * resolved `user_id` where one is known — design §22.
 */
import { and, eq, isNull, lt, not, or, sql } from "drizzle-orm";
import type { PlaidDb } from "./sync-store";
import { plaidAccounts, plaidItems } from "@/lib/db/schema";

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
  /** Null exactly once — before this item's first-ever successful sync.
   * Used to fire a one-time recurring-detection pass right after that first
   * sync lands, instead of waiting for the next daily job (design:
   * docs/specs/2026-09-16-recurring-detection-design.md §G). */
  lastSyncedAt: Date | null;
}

const COLS = {
  id: plaidItems.id,
  userId: plaidItems.userId,
  itemId: plaidItems.itemId,
  institutionId: plaidItems.institutionId,
  accessTokenEnc: plaidItems.accessTokenEnc,
  transactionsCursor: plaidItems.transactionsCursor,
  status: plaidItems.status,
  lastSyncedAt: plaidItems.lastSyncedAt,
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

/**
 * The longest any function in this app can run. Vercel Fluid compute (on for
 * this project) gives every function — route handlers, and the page functions
 * that run server actions — a 300s default, which is also Hobby's maximum.
 * A sync holder can't outlive its function, so this bounds every lease
 * holder: the webhook/sweep routes (`maxDuration = 300`, `after()` included)
 * and Sync now / mapping / resume import. performance-guardrails.test.ts pins
 * every `maxDuration` in src/app at or under it.
 */
export const FUNCTION_MAX_DURATION_SECONDS = 300;

/**
 * How long a sync claim is honoured: the longest holder plus a minute for
 * the platform's kill and an in-flight statement to land. Any shorter and a
 * live run could be treated as crashed; any longer and a killed run (and the
 * user's next Sync now) waits for nothing. An expired lease is what lets the
 * sweep — or the user — recover a killed run.
 */
export const SYNC_LEASE_SECONDS = FUNCTION_MAX_DURATION_SECONDS + 60;

/**
 * Which Items a claim may take:
 *  - `requested` — the user asked (Sync now / mapping / resume import): any
 *    status, flagged or not.
 *  - `due` — background work: `active` Items that are flagged `needs_sync`,
 *    or (with `staleBefore`) not synced since then.
 */
export type ClaimMode = { kind: "requested" } | { kind: "due"; staleBefore?: Date };

export interface SyncClaim {
  item: PlaidItemRecord;
  token: string;
}

const leaseFree = () =>
  or(
    isNull(plaidItems.syncClaimedAt),
    lt(plaidItems.syncClaimedAt, sql`now() - make_interval(secs => ${SYNC_LEASE_SECONDS})`),
  );

/** An Item with an account still awaiting the user's mapping choice. Syncing
 * it would skip that account's rows AND advance the cursor past them, losing
 * them for good — so it is never claimable until mapping is saved. */
const hasUnmappedAccount = () =>
  sql`exists (select 1 from ${plaidAccounts} where ${plaidAccounts.plaidItemId} = ${plaidItems.id} and ${plaidAccounts.linkState} = 'unmapped')`;

function dueConds(staleBefore?: Date) {
  return and(
    eq(plaidItems.status, "active"),
    staleBefore
      ? or(eq(plaidItems.needsSync, true), lt(plaidItems.lastSyncedAt, staleBefore))
      : eq(plaidItems.needsSync, true),
  );
}

/**
 * Atomically take the per-Item sync lease. One conditional UPDATE ... RETURNING:
 * concurrent claimers of the same row serialize on its row lock and Postgres
 * re-checks the WHERE against the winner's committed version, so at most one
 * caller gets a row back while the lease is live.
 *
 * The same UPDATE sets `needs_sync = true`: claimed work is unsettled until
 * {@link releaseSyncClaim} settles it. So a run killed before its release —
 * whatever started it — leaves a flagged Item behind that the sweep retries
 * as soon as the lease expires.
 */
export async function claimItemForSync(db: PlaidDb, itemId: string, mode: ClaimMode): Promise<SyncClaim | null> {
  const [row] = await db
    .update(plaidItems)
    .set({ needsSync: true, syncClaimToken: sql`gen_random_uuid()`, syncClaimedAt: sql`now()` })
    .where(
      and(
        eq(plaidItems.itemId, itemId),
        leaseFree(),
        not(hasUnmappedAccount()),
        mode.kind === "due" ? dueConds(mode.staleBefore) : undefined,
      ),
    )
    .returning({ ...COLS, token: plaidItems.syncClaimToken });
  if (!row) return null;
  const { token, ...item } = row;
  return { item: item as PlaidItemRecord, token: token as string };
}

/**
 * Release a claim — the only place `needs_sync` is settled. Fenced by its
 * token, so a holder whose lease already expired (and was re-claimed) can't
 * clear someone else's. `needs_sync` ends
 * true when this run asks for more (`resync`: failed, or pages left) or a
 * webhook arrived after the claim; otherwise false. Returns the new flag, or
 * `null` when the token no longer held the claim.
 */
export async function releaseSyncClaim(
  db: PlaidDb,
  itemId: string,
  token: string,
  resync: boolean,
): Promise<boolean | null> {
  const [row] = await db
    .update(plaidItems)
    .set({
      needsSync: sql`${resync}::boolean or coalesce(${plaidItems.lastWebhookAt} >= ${plaidItems.syncClaimedAt}, false)`,
      syncClaimToken: null,
      syncClaimedAt: null,
    })
    .where(and(eq(plaidItems.itemId, itemId), eq(plaidItems.syncClaimToken, token)))
    .returning({ needsSync: plaidItems.needsSync });
  return row ? row.needsSync : null;
}

export type ClaimMiss =
  | { kind: "unmapped" }
  | { kind: "gone" }
  /** Another run holds the lease; it expires in `retryAfterSeconds` (0 = already free). */
  | { kind: "busy"; retryAfterSeconds: number };

/** Why a claim came back empty — so a user-requested sync can say so. */
export async function claimMissReason(db: PlaidDb, itemId: string): Promise<ClaimMiss> {
  const [row] = await db
    .select({
      unmapped: sql<boolean>`${hasUnmappedAccount()}`,
      retryAfterSeconds: sql<number>`coalesce(greatest(0, ceil(extract(epoch from ${plaidItems.syncClaimedAt} + make_interval(secs => ${SYNC_LEASE_SECONDS}) - now())))::int, 0)`,
    })
    .from(plaidItems)
    .where(eq(plaidItems.itemId, itemId))
    .limit(1);
  if (!row) return { kind: "gone" };
  if (row.unmapped) return { kind: "unmapped" };
  return { kind: "busy", retryAfterSeconds: Number(row.retryAfterSeconds) };
}

/** Item ids the reconciliation sweep should try to claim: flagged or stale,
 * active, and not currently leased. The claim re-checks all of it atomically. */
export async function findSyncCandidates(db: PlaidDb, staleBefore: Date): Promise<string[]> {
  const rows = await db
    .select({ itemId: plaidItems.itemId })
    .from(plaidItems)
    .where(and(dueConds(staleBefore), leaseFree(), not(hasUnmappedAccount())))
    .orderBy(plaidItems.lastSyncedAt);
  return rows.map((r) => r.itemId);
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

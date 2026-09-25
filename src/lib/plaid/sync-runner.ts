/**
 * The one way a Plaid Item gets synced: claim its lease, run `syncItem`,
 * release. Every trigger goes through here — the webhook (after its 200), the
 * user's actions (Sync now / account mapping / resume import) and the
 * reconciliation sweep (`/api/plaid/sync-due`) — so two runs can never process
 * the same Item at once. Orchestration only; the lease itself is the atomic
 * UPDATE in item-store.ts (`claimItemForSync` / `releaseSyncClaim`).
 */
import type { PlaidApi } from "plaid";
import {
  type ClaimMode,
  claimItemForSync,
  type PlaidItemRecord,
  releaseSyncClaim,
  type SyncClaim,
} from "./item-store";
import { type SyncItemResult, syncItem } from "./sync-item";
import type { PlaidDb } from "./sync-store";

export interface SyncRunnerDeps {
  claim(itemId: string, mode: ClaimMode): Promise<SyncClaim | null>;
  /** Returns the Item's `needs_sync` after release (null = lease was lost). */
  release(itemId: string, token: string, resync: boolean): Promise<boolean | null>;
  sync(item: PlaidItemRecord): Promise<SyncItemResult>;
  now(): number;
}

export type ClaimedSync =
  | { claimed: true; result: SyncItemResult; morePending: boolean }
  | { claimed: false };

/** One claimed pass. Not claimed = another run holds the lease (or the Item
 * isn't eligible), and nothing is touched. */
export async function runClaimedSync(deps: SyncRunnerDeps, itemId: string, mode: ClaimMode): Promise<ClaimedSync> {
  const claim = await deps.claim(itemId, mode);
  if (!claim) return { claimed: false };

  // Failed, threw, or stopped at the page cap: release with resync so
  // needs_sync stays set and the next trigger (or the sweep) picks it up.
  let result: SyncItemResult;
  try {
    result = await deps.sync(claim.item);
  } catch (e) {
    await deps.release(itemId, claim.token, true);
    throw e;
  }
  const pending = await deps.release(itemId, claim.token, !result.ok || result.hasMore);
  return { claimed: true, result, morePending: pending === true };
}

/**
 * Sync an Item until nothing is pending: continues while the release reports
 * more work (pages left, or a webhook landed mid-run) and there is time left.
 * Stops on a failure — the sweep is the retry/backoff, not a tight loop.
 */
export async function drainItem(
  deps: SyncRunnerDeps,
  itemId: string,
  mode: ClaimMode,
  deadlineMs: number,
): Promise<SyncItemResult[]> {
  const results: SyncItemResult[] = [];
  let claimMode = mode;
  for (;;) {
    const out = await runClaimedSync(deps, itemId, claimMode);
    if (!out.claimed) break;
    results.push(out.result);
    if (!out.result.ok || !out.morePending || deps.now() >= deadlineMs) break;
    claimMode = { kind: "due" };
  }
  return results;
}

/** The reconciliation sweep over candidate ids, within a time budget. */
export async function sweepItems(
  deps: SyncRunnerDeps,
  itemIds: string[],
  staleBefore: Date,
  deadlineMs: number,
): Promise<SyncItemResult[]> {
  const results: SyncItemResult[] = [];
  for (const itemId of itemIds) {
    if (deps.now() >= deadlineMs) break;
    results.push(...(await drainItem(deps, itemId, { kind: "due", staleBefore }, deadlineMs)));
  }
  return results;
}

/** Real deps over a Drizzle db + Plaid client (wired by src/server/plaid/service.ts). */
export function plaidSyncRunnerDeps(deps: {
  db: PlaidDb;
  client: Pick<PlaidApi, "transactionsSync">;
  tokenEncKey: Buffer;
}): SyncRunnerDeps {
  const { db, client, tokenEncKey } = deps;
  return {
    claim: (itemId, mode) => claimItemForSync(db, itemId, mode),
    release: (itemId, token, resync) => releaseSyncClaim(db, itemId, token, resync),
    sync: (item) => syncItem({ db, client, item, tokenEncKey }),
    now: () => Date.now(),
  };
}

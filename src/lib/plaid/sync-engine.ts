/**
 * runSync — the orchestration for one `/transactions/sync` pass over a Plaid
 * Item. Pure of I/O: the Plaid call and all persistence are injected, so the
 * page loop, mutation-during-pagination restart, normalization, plan
 * application and cursor advance are all unit-tested with fakes. Design §12–17.
 *
 * The store applies inserts + updates + soft-deletes + the new cursor
 * atomically (`applyPlan`); a crash before that commit leaves the old cursor,
 * so the next run simply re-fetches and re-applies — idempotently.
 */
import { normalizePlaidTxn } from "./adapter";
import { applyPlaidSync, type ExistingPlaidRow, type SyncPlan } from "./apply-sync";
import { computeContentFingerprint } from "./content-fingerprint";
import type {
  NormalizeCtx,
  NormalizeSkipReason,
  PlaidNormalizedTxn,
  PlaidRemovedTxn,
  PlaidTxnInput,
} from "./types";

/**
 * Review-only anomaly trigger (design: 2026-09-12 duplicate-feed
 * investigation, "Phase 14"). NOT an identity or dedupe rule — crossing this
 * count only flags the account for owner review; it never changes which
 * transactions land, their direction/amount, or whether they count toward
 * financial totals. Set deliberately far above any plausible legitimate
 * same-day repeat purchase (the confirmed real-world defect this defends
 * against replicated at 50x; legitimate repeats are essentially always 1-2).
 */
export const ANOMALY_REVIEW_THRESHOLD = 10;

/** One page of `/transactions/sync`. */
export interface PlaidSyncPage {
  added: PlaidTxnInput[];
  modified: PlaidTxnInput[];
  removed: PlaidRemovedTxn[];
  next_cursor: string;
  has_more: boolean;
}

/** Thrown by the injected Plaid call to signal a restart (Plaid error code
 *  TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION). */
export class SyncMutationDuringPagination extends Error {
  constructor() {
    super("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION");
    this.name = "SyncMutationDuringPagination";
  }
}

/** The `transactions` fields the reducer needs, as the store returns them. */
export interface PlaidTxnRow {
  id: string;
  source_ref: string;
  user_categorized: boolean;
  category_id: string | null;
  note: string | null;
  is_transfer: boolean;
  removed_at: string | null;
}

export interface PlaidSyncStore {
  /** Existing `source='bank'` rows for the given transaction_ids. */
  findBySourceRefs(userId: string, refs: string[]): Promise<PlaidTxnRow[]>;
  /** Apply the plan and advance the cursor in one transaction. */
  applyPlan(
    userId: string,
    plan: SyncPlan,
    meta: { itemId: string; cursor: string },
  ): Promise<{ inserts: number; updates: number; softDeletes: number }>;
  /**
   * Current live (non-removed) row count per (accountId, contentFingerprint)
   * pair, AFTER this sync's inserts have landed — so it naturally captures
   * both same-sync and cross-sync accumulation with one query. Anomaly
   * detection only; never used to decide what to insert.
   */
  countByAccountFingerprint(
    pairs: { accountId: string; contentFingerprint: string }[],
  ): Promise<Map<string, number>>;
  /** Flag an account for owner review. Never suppresses/alters transactions. */
  flagAccountForReview(accountId: string, reason: string): Promise<void>;
}

export interface SyncDeps {
  userId: string;
  /** Plaid `item_id`. */
  itemId: string;
  /** The stored `plaid_items.transactions_cursor` (null on first sync). */
  initialCursor: string | null;
  transactionsSync: (args: { cursor: string | null }) => Promise<PlaidSyncPage>;
  store: PlaidSyncStore;
  normalizeCtx: NormalizeCtx;
  /** Cap pages fetched per run so one invocation never times out. Default 20. */
  maxPagesPerRun?: number;
  /** Restart budget for mutation-during-pagination. Default 3. */
  maxRestarts?: number;
}

export interface SyncOutcome {
  cursor: string | null;
  applied: { inserts: number; updates: number; softDeletes: number; skipped: number };
  skips: Array<{ transactionId: string; reason: NormalizeSkipReason }>;
  /** true when the page cap was hit — the caller should run again. */
  hasMore: boolean;
  restarts: number;
}

/** Fetch pages from `initialCursor` until `has_more` is false or the cap is hit. */
async function collectPages(
  transactionsSync: SyncDeps["transactionsSync"],
  initialCursor: string | null,
  maxPages: number,
): Promise<{ pages: PlaidSyncPage[]; cursor: string | null; capped: boolean }> {
  const pages: PlaidSyncPage[] = [];
  let cursor: string | null = initialCursor;
  for (let i = 0; i < maxPages; i++) {
    const page = await transactionsSync({ cursor });
    pages.push(page);
    cursor = page.next_cursor;
    if (!page.has_more) return { pages, cursor, capped: false };
  }
  return { pages, cursor, capped: true };
}

export async function runSync(deps: SyncDeps): Promise<SyncOutcome> {
  const {
    userId,
    itemId,
    initialCursor,
    transactionsSync,
    store,
    normalizeCtx,
    maxPagesPerRun = 20,
    maxRestarts = 3,
  } = deps;

  // ---- page loop. On a mid-pagination mutation, discard partial results and
  //      restart from `initialCursor` (Plaid's guidance), up to `maxRestarts`.
  let restarts = 0;
  let pages: PlaidSyncPage[] = [];
  let cursor: string | null = initialCursor;
  let cappedMore = false;

  for (;;) {
    try {
      const collected = await collectPages(transactionsSync, initialCursor, maxPagesPerRun);
      pages = collected.pages;
      cursor = collected.cursor;
      cappedMore = collected.capped;
      break;
    } catch (e) {
      if (e instanceof SyncMutationDuringPagination && ++restarts <= maxRestarts) continue;
      throw e;
    }
  }

  // ---- flatten + normalize
  const rawAdded = pages.flatMap((p) => p.added);
  const rawModified = pages.flatMap((p) => p.modified);
  const removed = pages.flatMap((p) => p.removed);

  const skips: SyncOutcome["skips"] = [];
  const normalize = (rows: PlaidTxnInput[]): PlaidNormalizedTxn[] => {
    const out: PlaidNormalizedTxn[] = [];
    for (const r of rows) {
      const res = normalizePlaidTxn(r, normalizeCtx);
      if (res.kind === "txn") out.push(res.txn);
      else skips.push({ transactionId: res.transactionId, reason: res.reason });
    }
    return out;
  };
  const added = normalize(rawAdded);
  const modified = normalize(rawModified);

  // ---- load the existing rows the reducer needs (by source_ref + pending refs)
  const refs = new Set<string>();
  for (const t of [...added, ...modified]) {
    refs.add(t.sourceRef);
    if (t.pendingSourceRef) refs.add(t.pendingSourceRef);
  }
  for (const r of removed) refs.add(r.transaction_id);

  const rows = refs.size ? await store.findBySourceRefs(userId, [...refs]) : [];
  const existing = new Map<string, ExistingPlaidRow>(
    rows.map((r) => [
      r.source_ref,
      {
        id: r.id,
        sourceRef: r.source_ref,
        userCategorized: r.user_categorized,
        categoryId: r.category_id,
        note: r.note,
        isTransfer: r.is_transfer,
        removedAt: r.removed_at,
      },
    ]),
  );

  const plan = applyPlaidSync({ added, modified, removed, existing });

  // Always persist: even a no-change incremental sync advances the cursor.
  const finalCursor = cursor ?? initialCursor ?? "";
  const applied = await store.applyPlan(userId, plan, { itemId, cursor: finalCursor });

  // Anomaly detection (design: 2026-09-12, "Phase 14") — review-only. Runs
  // AFTER the insert above, never gates or alters it. Counting live rows per
  // (account, fingerprint) post-insert naturally covers both a same-sync
  // cluster (many inserted together) and cross-sync accumulation (a few now,
  // more already landed from an earlier sync) with one check.
  if (plan.inserts.length > 0) {
    const candidates = new Map<string, { accountId: string; contentFingerprint: string }>();
    for (const n of plan.inserts) {
      const contentFingerprint = computeContentFingerprint(n.raw);
      candidates.set(`${n.accountId}:${contentFingerprint}`, { accountId: n.accountId, contentFingerprint });
    }
    const counts = await store.countByAccountFingerprint([...candidates.values()]);
    for (const [key, { accountId }] of candidates) {
      const count = counts.get(key) ?? 0;
      if (count >= ANOMALY_REVIEW_THRESHOLD) {
        await store.flagAccountForReview(
          accountId,
          `${count} transactions with identical content (differing only by Plaid's own transaction ID) — this connection's data may be unreliable until reviewed.`,
        );
      }
    }
  }

  return {
    cursor: finalCursor,
    applied: { ...applied, skipped: skips.length },
    skips,
    hasMore: cappedMore,
    restarts,
  };
}

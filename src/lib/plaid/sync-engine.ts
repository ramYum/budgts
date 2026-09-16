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
import {
  ADVANCIAL_INSTITUTION_ID,
  ANOMALY_DUPLICATE_REASON_MARKER,
  planReplayContainment,
  type ContainmentCandidate,
  type ContainmentUpdate,
} from "./replay-containment";
import { AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD, detectSignConvention } from "./sign-convention";
import type { SignEvidenceTxn } from "./sign-convention";
import { isEventRole } from "./event-role";
import { findTransferPairs, type PairingCandidate } from "./transfer-pairing";
import type {
  EventRole,
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

/** Plaid's `error_code` for a `/transactions/sync` call that failed because
 *  the underlying transaction data changed mid-pagination (Plaid docs:
 *  https://plaid.com/docs/errors/transactions/#transactions_sync_mutation_during_pagination
 *  — restart the whole pagination loop from the original cursor). Single
 *  source of truth: sync-item.ts uses this to recognize the raw SDK error,
 *  error-policy.ts uses it to classify the wrapped error distinctly instead
 *  of falling through to UNKNOWN. */
export const MUTATION_DURING_PAGINATION_CODE = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

/** Thrown by the injected Plaid call to signal a restart (Plaid error code
 *  TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION). Carries the real Plaid
 *  error_code/error_type as own properties (matching PlaidErrorShape) so
 *  error-policy.ts's readPlaidError/classifyPlaidError recognize this
 *  specific, documented, recoverable-by-retry condition even after local
 *  restarts are exhausted and it propagates up — see error-policy.ts. */
export class SyncMutationDuringPagination extends Error {
  readonly error_code = MUTATION_DURING_PAGINATION_CODE;
  readonly error_type = "TRANSACTIONS_ERROR";
  constructor() {
    super(MUTATION_DURING_PAGINATION_CODE);
    this.name = "SyncMutationDuringPagination";
  }
}

/**
 * Delay before restart attempt `attempt` (1-indexed) of a mutation-during-
 * pagination retry. Plaid's docs (see MUTATION_DURING_PAGINATION_CODE above)
 * specify no delay or backoff requirement — restarting immediately is
 * documented as correct. This backoff is purely our own engineering policy,
 * not a Plaid requirement: a small, bounded pause gives a genuinely transient
 * mutation a moment to settle before the next attempt, without meaningfully
 * lengthening a request that ultimately succeeds or a request that ultimately
 * fails. Doubles from 250ms, capped at 1000ms — worst case (all maxRestarts
 * exhausted, default 3) adds ~1.75s total, well within a server action's budget.
 */
export function mutationRestartDelayMs(attempt: number): number {
  const base = 250;
  const cap = 1000;
  return Math.min(base * 2 ** (attempt - 1), cap);
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
  status: "confirmed" | "pending_review";
  pending_reason: "currency_mismatch" | "sign_convention_unknown" | null;
  transfer_user_set: boolean;
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
  /**
   * Evidence for the given `plaid_accounts.id` values — every live row still
   * pending review for the sign-unknown reason, across every prior sync
   * (cumulative). Keyed by the specific connected Plaid account, never the
   * Budgts account — a user can map multiple Plaid accounts to one Budgts
   * account, and evidence from two different institutions' feeds must never
   * be pooled together.
   */
  getSignConventionEvidence(plaidAccountRowIds: string[]): Promise<Map<string, SignEvidenceTxn[]>>;
  /**
   * Records a resolved sign convention for one specific Plaid-connected
   * account (`plaid_accounts.id`, not the Budgts account) and confirms every
   * row still pending review for the sign-unknown reason on that account —
   * flipping `direction` too when the resolved convention is `inverted`.
   * Never touches a row pending review for a different reason, and never
   * touches a different Plaid account even if it maps to the same Budgts
   * account.
   */
  finalizeSignConvention(plaidAccountRowId: string, convention: "standard" | "inverted"): Promise<void>;
  /**
   * Every not-yet-excluded row for one Budgts account, for Advancial replay
   * containment (design 2026-09-14, replay-containment.ts). Institution-
   * scoped at the call site, not here — this method itself has no opinion
   * about which institution it's being used for.
   */
  findContainmentCandidates(accountId: string): Promise<ContainmentCandidate[]>;
  /**
   * Sets `duplicate_of_id` on each planned duplicate, idempotently (only
   * where currently null) — safe to call every sync. The row is kept
   * forever, just excluded from financial totals (qualify.ts), the same
   * treatment `is_transfer` already gets.
   */
  applyReplayContainment(updates: ContainmentUpdate[]): Promise<{ marked: number }>;
  /**
   * Clears a stale review flag left over from *before* replay containment
   * existed (or before this account's duplicates were contained) — but
   * ONLY when the account's current `review_reason` still matches
   * `reasonMarker` exactly (the anomaly detector's own duplicate-content
   * wording). A flag for any other reason (e.g. sign-convention ambiguity)
   * is untouched, since containment has nothing to say about it. A no-op
   * when the account isn't flagged, or is flagged for something else.
   */
  clearReplayReviewFlag(accountId: string, reasonMarker: string): Promise<void>;

  /**
   * Paired-transfer detection (V1.5, design: docs/specs/
   * 2026-09-16-paired-transfer-detection-design.md). USER-WIDE, not
   * account/item-scoped — unlike replay containment and sign-convention
   * above, a transfer's counterpart can live on a completely different
   * Plaid Item than the one this sync just touched. Every candidacy
   * exclusion (duplicate_of_id, transfer_user_set, removed_at, status,
   * pending, source, transfer_pair_id, and the P2P_PAYMENT/REFUND/INCOME
   * role exclusion) is applied here — the pure matcher trusts its input is
   * already the eligible set.
   */
  findTransferPairingCandidates(userId: string): Promise<TransferPairingCandidateRow[]>;
  /**
   * Tier A — link only. Locks both legs (ascending id order, deadlock-free),
   * re-validates eligibility UNDER the lock (a candidate may have gone
   * stale since discovery: paired by a concurrent sync, user-overridden,
   * removed, marked duplicate), and on success writes `transfer_pair_id`
   * on both sides. Structurally incapable of touching `event_role`/
   * `is_transfer` — those columns never appear in this method's SQL at
   * all, by construction, not by convention. One Postgres transaction per
   * call. Returns "skipped" (no write, no error) when re-validation fails
   * — the pair may be reconsidered on a future sync. Takes the full leg
   * snapshots (not just ids) purely so callers never need a second query;
   * this method itself only ever writes `transfer_pair_id`.
   */
  applyTierALink(userId: string, legA: TransferPairLeg, legB: TransferPairLeg): Promise<TransferPairApplyResult>;
  /**
   * Tier B — corrective classify + link. Same lock-and-revalidate
   * discipline as {@link applyTierALink}, but writes `is_transfer=true` +
   * `event_role='TRANSFER'` on ONLY `classifyLegId` (the previously
   * unresolved leg) — the already-transfer-shaped leg gets `transfer_pair_id`
   * only, never a role rewrite. On success, emits one structured audit log
   * line (tier, user id, both transaction/account ids, amount, direction,
   * date relationship, pre-classification roles/isTransfer) — no merchant
   * or description text. The pre-classification snapshots come from
   * `legA`/`legB` themselves (captured by the pure matcher before any
   * write), not a re-read after the fact.
   */
  applyTierBClassification(
    userId: string,
    legA: TransferPairLeg,
    legB: TransferPairLeg,
    classifyLegId: string,
  ): Promise<TransferPairApplyResult>;
  /**
   * Symmetric stale-pair cleanup, run once per sync BEFORE discovery. A
   * pair is stale if either leg is removed, marked a confirmed duplicate,
   * user-overridden (`transfer_user_set=true`), or the relationship is no
   * longer mutual (partner's `transfer_pair_id` doesn't point back) — e.g.
   * a pending leg's soft-deleted after being replaced by a posted row.
   * Never leaves a surviving transaction pointing at a dead/duplicate/
   * overridden partner. Returns the number of pairs cleared.
   */
  reconcileStaleTransferPairs(userId: string): Promise<number>;
}

/** A candidate row for paired-transfer detection — see
 * {@link PlaidSyncStore.findTransferPairingCandidates}. */
export interface TransferPairingCandidateRow {
  id: string;
  accountId: string;
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  eventRole: string | null;
  isTransfer: boolean;
}

/** Same shape as {@link TransferPairingCandidateRow} — the pre-write
 * snapshot of one leg, threaded through to the apply methods so Tier B's
 * audit log reflects the state the pure matcher actually decided on. */
export type TransferPairLeg = TransferPairingCandidateRow;

export type TransferPairApplyResult = "applied" | "skipped";

export interface SyncDeps {
  userId: string;
  /** Plaid `item_id`. */
  itemId: string;
  /** The item's `plaid_items.institution_id` — gates Advancial replay
   * containment (replay-containment.ts) to that one confirmed institution,
   * never a general rule. `null`/unknown institutions never trigger it. */
  institutionId: string | null;
  /** The stored `plaid_items.transactions_cursor` (null on first sync). */
  initialCursor: string | null;
  transactionsSync: (args: { cursor: string | null }) => Promise<PlaidSyncPage>;
  store: PlaidSyncStore;
  normalizeCtx: NormalizeCtx;
  /** Cap pages fetched per run so one invocation never times out. Default 20. */
  maxPagesPerRun?: number;
  /** Restart budget for mutation-during-pagination. Default 3. */
  maxRestarts?: number;
  /**
   * Injected so tests can assert on/skip the real wait — see
   * mutationRestartDelayMs's docstring for why this delay exists and why
   * its values are our policy, not Plaid's. Defaults to a real setTimeout.
   */
  delay?: (ms: number) => Promise<void>;
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
    institutionId,
    initialCursor,
    transactionsSync,
    store,
    normalizeCtx,
    maxPagesPerRun = 20,
    maxRestarts = 3,
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = deps;

  // ---- page loop. On a mid-pagination mutation, discard partial results and
  //      restart from `initialCursor` (Plaid's guidance), up to `maxRestarts`.
  //      A bounded backoff (mutationRestartDelayMs) runs before each restart
  //      — never before the first attempt, never after the final exhausted
  //      one, since at that point we're rethrowing, not retrying.
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
      if (e instanceof SyncMutationDuringPagination && ++restarts <= maxRestarts) {
        await delay(mutationRestartDelayMs(restarts));
        continue;
      }
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
        status: r.status,
        pendingReason: r.pending_reason,
        transferUserSet: r.transfer_user_set,
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
          `${count} transactions with ${ANOMALY_DUPLICATE_REASON_MARKER} — this connection's data may be unreliable until reviewed.`,
        );
      }
    }
  }

  // Sign-convention resolution (design: 2026-09-12 North Star Architecture
  // §2) — runs after the insert above, for every PLAID-CONNECTED account
  // (`plaid_accounts.id`) touched this sync that is still `unknown`. Keyed on
  // the Plaid account, never the Budgts account: two Plaid accounts can map
  // to one Budgts account, and pooling two institutions' feeds would let a
  // majority feed sign-invert a minority feed's correct transactions. Only
  // the (purely advisory) review flag stays Budgts-account-scoped, since
  // that's what the owner-facing UI hangs off. Gathers cumulative evidence (not just this
  // sync's rows, same reasoning as the anomaly check above); an account
  // that resolves gets every one of its pending rows finalized in one pass;
  // an account that stays genuinely ambiguous past a larger sample gets
  // flagged for review instead of left silently stuck forever.
  const conventionByPlaidAccountRowId = new Map(
    [...normalizeCtx.accountMap.values()].map((a) => [a.plaidAccountRowId, a.signConvention]),
  );
  const budgtsAccountIdByPlaidAccountRowId = new Map(
    [...normalizeCtx.accountMap.values()].map((a) => [a.plaidAccountRowId, a.budgtsAccountId]),
  );
  const touchedPlaidAccountRowIds = new Set(plan.inserts.map((n) => n.plaidAccountRowId));
  const unknownPlaidAccountRowIds = [...touchedPlaidAccountRowIds].filter(
    (id) => conventionByPlaidAccountRowId.get(id) === "unknown",
  );
  if (unknownPlaidAccountRowIds.length > 0) {
    const evidenceByAccount = await store.getSignConventionEvidence(unknownPlaidAccountRowIds);
    for (const plaidAccountRowId of unknownPlaidAccountRowIds) {
      const evidence = evidenceByAccount.get(plaidAccountRowId) ?? [];
      const verdict = detectSignConvention(evidence);
      if (verdict === "standard" || verdict === "inverted") {
        await store.finalizeSignConvention(plaidAccountRowId, verdict);
      } else if (evidence.length >= AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD) {
        const budgtsAccountId = budgtsAccountIdByPlaidAccountRowId.get(plaidAccountRowId);
        if (budgtsAccountId) {
          await store.flagAccountForReview(
            budgtsAccountId,
            `Budgts can't confidently determine this account's transaction sign convention after ${evidence.length} transactions — some data may be miscategorized until reviewed.`,
          );
        }
      }
    }
  }

  // Advancial replay containment (design 2026-09-14, replay-containment.ts)
  // — automatic, but gated on this one confirmed institution_id so it can
  // never touch any other institution's or user's data. Runs per touched
  // Budgts account (not per Plaid account) so a fresh sync's new copies get
  // grouped against the account's full history, not just this batch.
  if (institutionId === ADVANCIAL_INSTITUTION_ID) {
    const touchedAccountIds = new Set(plan.inserts.map((n) => n.accountId));
    for (const accountId of touchedAccountIds) {
      const candidates = await store.findContainmentCandidates(accountId);
      const containmentUpdates = planReplayContainment(candidates);
      if (containmentUpdates.length > 0) await store.applyReplayContainment(containmentUpdates);
      // Every remaining (non-duplicate) row for this account is now
      // guaranteed fingerprint-unique — containment just collapsed every
      // 2+ group down to one. So whatever anomaly flag Phase 14 set for
      // this exact defect is now stale; clear it (marker-gated, so an
      // unrelated flag reason is left alone).
      await store.clearReplayReviewFlag(accountId, ANOMALY_DUPLICATE_REASON_MARKER);
    }
  }

  // Paired-transfer detection (V1.5, design: docs/specs/
  // 2026-09-16-paired-transfer-detection-design.md) — a post-applyPlan
  // pass, same structural position as sign-convention/replay-containment
  // above, but deliberately USER-WIDE rather than scoped to this sync's
  // touched accounts: a transfer's counterpart can live on any of the
  // user's other accounts, connected via a completely different Plaid
  // Item than the one currently syncing. Reconcile stale relationships
  // first (a prior pair may have gone stale since the last sync — a leg
  // removed/duplicated/user-overridden), then discover and apply fresh
  // pairs. Discovery is advisory only; each store.applyTier* call
  // re-validates and locks for real, so this loop never assumes success.
  const pairingStart = Date.now();
  const clearedStalePairs = await store.reconcileStaleTransferPairs(userId);
  const pairingCandidateRows = await store.findTransferPairingCandidates(userId);
  const candidateQueryMs = Date.now() - pairingStart;

  const toEventRoleOrNull = (value: string | null): EventRole | null =>
    value != null && isEventRole(value) ? value : null;
  const pairingCandidates: PairingCandidate[] = pairingCandidateRows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    amount: r.amount,
    direction: r.direction,
    occurredAt: r.occurredAt,
    eventRole: toEventRoleOrNull(r.eventRole),
    isTransfer: r.isTransfer,
  }));
  const { accepted: acceptedPairs, ambiguous: ambiguousPairs } = findTransferPairs(pairingCandidates);

  const candidateById = new Map(pairingCandidateRows.map((r) => [r.id, r]));
  const applyStart = Date.now();
  let appliedPairs = 0;
  let skippedStalePairs = 0;
  for (const pair of acceptedPairs) {
    const legA = candidateById.get(pair.legA);
    const legB = candidateById.get(pair.legB);
    if (!legA || !legB) continue; // defensive — every accepted id came from this same candidate set
    const result =
      pair.tier === "A"
        ? await store.applyTierALink(userId, legA, legB)
        : await store.applyTierBClassification(userId, legA, legB, pair.classifyLegId as string);
    if (result === "applied") appliedPairs += 1;
    else skippedStalePairs += 1;
  }
  const applyMs = Date.now() - applyStart;

  // Lightweight Scale & Infrastructure instrumentation (docs/roadmap.md's
  // Scale & Infrastructure track) — this is a new recurring, user-wide
  // query shape, additive to the load already under discussion there.
  console.log("[plaid] transfer-pairing", {
    userId,
    candidateCount: pairingCandidates.length,
    candidateQueryMs,
    acceptedCount: acceptedPairs.length,
    appliedCount: appliedPairs,
    skippedStaleCount: skippedStalePairs,
    ambiguousCount: ambiguousPairs.length,
    reconciledStaleCount: clearedStalePairs,
    applyMs,
  });

  return {
    cursor: finalCursor,
    applied: { ...applied, skipped: skips.length },
    skips,
    hasMore: cappedMore,
    restarts,
  };
}

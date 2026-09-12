/**
 * applyPlaidSync — the pure reducer that turns one `/transactions/sync` result
 * (added / modified / removed, already normalized) plus a snapshot of the
 * matching existing rows into a persistence plan: inserts, field updates, and
 * soft-deletes. The sync engine wraps the plan in one DB transaction.
 *
 * Invariants (design §16–17):
 *  - Idempotent: re-applying the same batch yields no new inserts and no new
 *    soft-deletes.
 *  - A user-set category is never overwritten (`userCategorized` rows keep
 *    their `categoryId` / `isTransfer` on a `modified`, and a user-set category
 *    is carried forward onto a pending→posted replacement).
 *  - A soft-deleted row is never resurrected.
 *  - The ledger only ever holds real Plaid events — no predicted / future rows.
 */
import type { PlaidNormalizedTxn, PlaidRemovedTxn } from "./types";

/** The existing-row fields the reducer needs, keyed by `source_ref`. */
export interface ExistingPlaidRow {
  id: string;
  sourceRef: string;
  userCategorized: boolean;
  categoryId: string | null;
  note: string | null;
  isTransfer: boolean;
  removedAt: string | null;
  status: "confirmed" | "pending_review";
  pendingReason: "currency_mismatch" | "sign_convention_unknown" | null;
}

/** Fields a `modified` re-normalization may change (camelCase; landing maps to columns). */
export interface TxnPatch {
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  description: string;
  status: "confirmed" | "pending_review";
  pendingReason: "currency_mismatch" | "sign_convention_unknown" | null;
  pending: boolean;
  merchantName: string | null;
  merchantEntityId: string | null;
  plaidCategoryPrimary: string | null;
  plaidCategoryDetailed: string | null;
  plaidPfcConfidence: string | null;
  authorizedAt: string | null;
  raw: unknown;
  /** Omitted when the existing row is `userCategorized` (don't clobber a user choice). */
  categoryId?: string | null;
  isTransfer?: boolean;
}

export interface SyncInput {
  added: PlaidNormalizedTxn[];
  modified: PlaidNormalizedTxn[];
  removed: PlaidRemovedTxn[];
  /**
   * Snapshot of existing rows, keyed by `source_ref`. Must include every
   * `sourceRef` in added/modified/removed AND every `pendingSourceRef`
   * referenced by an `added` row (for carry-over).
   */
  existing: ReadonlyMap<string, ExistingPlaidRow>;
}

export interface SyncPlan {
  inserts: PlaidNormalizedTxn[];
  updates: Array<{ id: string; patch: TxnPatch }>;
  /** row ids to stamp `removed_at`. */
  softDeletes: string[];
}

function patchFrom(n: PlaidNormalizedTxn, ex: ExistingPlaidRow | undefined): TxnPatch {
  // Never demote an already-confirmed row into sign-unknown pending review —
  // this feature only gates rows landing after it ships; it must never
  // silently pull an already-trusted, already-counted row out of the
  // financial totals just because the account's sign_convention currently
  // reads 'unknown' (which is also the default for every pre-existing
  // account, not just genuinely new ones). A row that's already confirmed
  // keeps its confirmed status regardless of what the fresh normalization
  // computed.
  const demotingConfirmedToSignUnknown =
    n.pendingReason === "sign_convention_unknown" && ex?.status === "confirmed";
  const p: TxnPatch = {
    amount: n.amount,
    direction: n.direction,
    occurredAt: n.occurredAt,
    description: n.description,
    status: demotingConfirmedToSignUnknown ? "confirmed" : (n.status as TxnPatch["status"]),
    pendingReason: demotingConfirmedToSignUnknown ? null : n.pendingReason,
    pending: n.pending,
    merchantName: n.merchantName,
    merchantEntityId: n.merchantEntityId,
    plaidCategoryPrimary: n.plaidCategoryPrimary,
    plaidCategoryDetailed: n.plaidCategoryDetailed,
    plaidPfcConfidence: n.plaidPfcConfidence,
    authorizedAt: n.authorizedAt,
    raw: n.raw,
  };
  // Only touch category / transfer flag when the user hasn't claimed the row.
  if (!ex?.userCategorized) {
    p.categoryId = n.categoryId;
    p.isTransfer = n.isTransfer;
  }
  return p;
}

export function applyPlaidSync(input: SyncInput): SyncPlan {
  const { added, modified, removed, existing } = input;
  const plan: SyncPlan = { inserts: [], updates: [], softDeletes: [] };

  const upsertExisting = (n: PlaidNormalizedTxn, ex: ExistingPlaidRow) => {
    if (ex.removedAt) return; // never resurrect a soft-deleted row
    plan.updates.push({ id: ex.id, patch: patchFrom(n, ex) });
  };

  for (const a of added) {
    const ex = existing.get(a.sourceRef);
    if (ex) {
      // Replay or a re-sent add — treat as a modify.
      upsertExisting(a, ex);
      continue;
    }
    // Pending → posted carry-over: a user-set category on the pending row moves
    // to the posted replacement so the correction isn't lost.
    let toInsert = a;
    if (a.pendingSourceRef) {
      const pend = existing.get(a.pendingSourceRef);
      if (pend?.userCategorized) {
        toInsert = {
          ...a,
          categoryId: pend.categoryId,
          userCategorized: true,
          note: a.note ?? pend.note,
        };
      }
    }
    plan.inserts.push(toInsert);
  }

  for (const m of modified) {
    const ex = existing.get(m.sourceRef);
    if (!ex) {
      // Plaid reports a change to a row we don't have — recover it as an insert.
      plan.inserts.push(m);
      continue;
    }
    upsertExisting(m, ex);
  }

  for (const r of removed) {
    const ex = existing.get(r.transaction_id);
    if (ex && !ex.removedAt) plan.softDeletes.push(ex.id);
  }

  return plan;
}

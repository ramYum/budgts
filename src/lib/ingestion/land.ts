import { UniqueViolationError } from "./types";
import type { NewTransactionRow, NormalizedTxn, TransactionRow, TransactionStore } from "./types";

/** NormalizedTxn -> the snake_case row shape the DB expects. */
export function toRow(userId: string, n: NormalizedTxn): NewTransactionRow {
  return {
    user_id: userId,
    account_id: n.accountId,
    category_id: n.categoryId,
    amount: n.amount,
    direction: n.direction,
    occurred_at: n.occurredAt,
    description: n.description,
    note: n.note,
    source: n.source,
    source_ref: n.sourceRef,
    status: n.status,
    is_transfer: n.isTransfer,
  };
}

/**
 * The single insert path for every transaction source. Sourced transactions
 * with a `sourceRef` are deduped against `(user_id, source, source_ref)`;
 * manual entries (no `sourceRef`) always insert.
 *
 * The pre-insert `findExisting` check races with concurrent ingestions of the
 * same `sourceRef`, so a losing insert surfaces as `UniqueViolationError` from
 * the partial unique index; we then re-read and return the row that won.
 *
 * `replayed` is true when the answer is a row that was already there (found
 * before the insert, or the race's winner): nothing of this call's values was
 * written. A native create retried with the same request id learns from it
 * that changes typed after the first try were not applied.
 */
export async function landTransaction(
  store: TransactionStore,
  userId: string,
  n: NormalizedTxn,
): Promise<{ row: TransactionRow; replayed: boolean }> {
  if (n.sourceRef) {
    const existing = await store.findExisting(userId, n.source, n.sourceRef);
    if (existing) return { row: existing, replayed: true };
  }

  try {
    return { row: await store.insert(toRow(userId, n)), replayed: false };
  } catch (e) {
    if (e instanceof UniqueViolationError && n.sourceRef) {
      const raced = await store.findExisting(userId, n.source, n.sourceRef);
      if (raced) return { row: raced, replayed: true };
    }
    throw e;
  }
}

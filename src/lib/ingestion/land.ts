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
 */
export async function landTransaction(
  store: TransactionStore,
  userId: string,
  n: NormalizedTxn,
): Promise<TransactionRow> {
  if (n.sourceRef) {
    const existing = await store.findExisting(userId, n.source, n.sourceRef);
    if (existing) return existing;
  }
  return store.insert(toRow(userId, n));
}

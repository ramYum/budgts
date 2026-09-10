/**
 * PlaidNormalizedTxn -> a Drizzle insert value for the `transactions` table
 * (base columns + the additive 0004 columns). The generic
 * `src/lib/ingestion/land.ts` is untouched; the Plaid sync path uses this
 * richer shape through {@link PlaidSyncStore}.
 *
 * `transfer_pair_id` / `recurring_stream_id` / `removed_at` are deliberately
 * never set here — they belong to V1.5 / the soft-delete path, not an insert.
 */
import type { transactions } from "@/lib/db/schema";
import type { PlaidNormalizedTxn } from "./types";

type TxnInsert = typeof transactions.$inferInsert;

/** The subset of columns a Plaid-sourced insert populates. */
export type PlaidTxnInsert = Pick<
  TxnInsert,
  | "userId"
  | "accountId"
  | "plaidAccountId"
  | "categoryId"
  | "amount"
  | "direction"
  | "occurredAt"
  | "description"
  | "note"
  | "source"
  | "sourceRef"
  | "status"
  | "isTransfer"
  | "pending"
  | "pendingPlaidTransactionId"
  | "merchantName"
  | "merchantEntityId"
  | "plaidCategoryPrimary"
  | "plaidCategoryDetailed"
  | "plaidPfcConfidence"
  | "userCategorized"
  | "authorizedAt"
  | "raw"
>;

export function plaidToInsert(userId: string, n: PlaidNormalizedTxn): PlaidTxnInsert {
  return {
    userId,
    accountId: n.accountId,
    plaidAccountId: n.plaidAccountRowId,
    categoryId: n.categoryId,
    amount: n.amount,
    direction: n.direction,
    occurredAt: new Date(n.occurredAt),
    description: n.description,
    note: n.note,
    source: "bank",
    sourceRef: n.sourceRef,
    status: n.status === "pending_review" ? "pending_review" : "confirmed",
    isTransfer: n.isTransfer,
    pending: n.pending,
    pendingPlaidTransactionId: n.pendingSourceRef,
    merchantName: n.merchantName,
    merchantEntityId: n.merchantEntityId,
    plaidCategoryPrimary: n.plaidCategoryPrimary,
    plaidCategoryDetailed: n.plaidCategoryDetailed,
    plaidPfcConfidence: n.plaidPfcConfidence,
    userCategorized: n.userCategorized,
    authorizedAt: n.authorizedAt ? new Date(n.authorizedAt) : null,
    raw: n.raw,
  };
}

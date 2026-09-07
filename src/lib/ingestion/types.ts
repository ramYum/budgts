import type { Direction } from "@/lib/validation/transaction";

export type TransactionSource = "manual" | "email" | "receipt" | "bank";
export type TxnStatus = "confirmed" | "pending_review";

/** Common shape every ingestion source produces. */
export interface NormalizedTxn {
  accountId: string;
  categoryId: string | null;
  amount: number; // minor units, > 0
  direction: Direction;
  occurredAt: string; // ISO 8601
  description: string;
  note: string | null;
  isTransfer: boolean;
  source: TransactionSource;
  sourceRef: string | null; // stable id from the source, for dedupe
  status: TxnStatus;
}

export interface IngestionAdapter {
  source: TransactionSource;
  normalize(raw: unknown): NormalizedTxn;
  dedupeKey(n: NormalizedTxn): string | null;
}

/** A `transactions` row as returned by Supabase (snake_case). */
export interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  amount: number;
  direction: Direction;
  occurred_at: string;
  description: string;
  note: string | null;
  source: TransactionSource;
  source_ref: string | null;
  status: TxnStatus;
  is_transfer: boolean;
  created_at: string;
}

export type NewTransactionRow = Omit<TransactionRow, "id" | "created_at">;

/**
 * The only persistence `landTransaction` needs. A real implementation
 * (`supabaseTransactionStore`) wraps the user's supabase client; tests use an
 * in-memory fake.
 */
export interface TransactionStore {
  findExisting(
    userId: string,
    source: TransactionSource,
    sourceRef: string,
  ): Promise<TransactionRow | null>;
  insert(row: NewTransactionRow): Promise<TransactionRow>;
}

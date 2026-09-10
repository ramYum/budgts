/**
 * Plaid-side types for the V1 ingestion pipeline. The pure modules
 * (adapter, category-map, apply-sync) work against these — not the raw Plaid
 * SDK response types — so unit-test fixtures stay small. A real Plaid
 * `Transaction` is structurally assignable to {@link PlaidTxnInput}.
 *
 * Design: docs/specs/2026-09-09-v1-plaid-transaction-ingestion-design.md §12–17.
 */
import type { NormalizedTxn } from "@/lib/ingestion/types";

/** The subset of a Plaid `Transaction` the adapter reads. */
export interface PlaidTxnInput {
  transaction_id: string;
  account_id: string;
  /** Positive = money out of the account; negative = money in. */
  amount: number;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  /** Post date, `YYYY-MM-DD`. Always present. */
  date: string;
  /** Post datetime, ISO 8601. Present for some institutions. */
  datetime?: string | null;
  authorized_date?: string | null;
  authorized_datetime?: string | null;
  name: string;
  merchant_name?: string | null;
  merchant_entity_id?: string | null;
  pending: boolean;
  /** Set on a POSTED txn: the id of the pending txn it replaces. */
  pending_transaction_id: string | null;
  personal_finance_category?: {
    primary: string;
    detailed: string;
    confidence_level?: string | null;
  } | null;
}

/** The subset of a Plaid `RemovedTransaction`. */
export interface PlaidRemovedTxn {
  transaction_id: string;
  account_id?: string | null;
}

/**
 * A `NormalizedTxn` plus the Plaid-only fields V1 persists to the additive
 * `transactions` columns (migration 0004). `landPlaidTxn` maps this to a row.
 */
export interface PlaidNormalizedTxn extends NormalizedTxn {
  source: "bank";
  /** Plaid `transaction_id` — the dedupe key. */
  sourceRef: string;
  /** `plaid_accounts.id` (our uuid) this came from — written to `transactions.plaid_account_id`. */
  plaidAccountRowId: string;
  /**
   * `false` from the adapter. `applyPlaidSync` flips it to `true` only when a
   * user-set category is carried forward onto a pending→posted replacement.
   * The user-correction step also sets it on a real edit.
   */
  userCategorized: boolean;
  pending: boolean;
  /** Plaid `pending_transaction_id` — for pending→posted carry-over. */
  pendingSourceRef: string | null;
  merchantName: string | null;
  merchantEntityId: string | null;
  plaidCategoryPrimary: string | null;
  plaidCategoryDetailed: string | null;
  plaidPfcConfidence: string | null;
  authorizedAt: string | null;
  /** The raw Plaid transaction payload, stored on `transactions.raw`. */
  raw: unknown;
}

/** Why a Plaid transaction was not turned into a ledger row. */
export type NormalizeSkipReason =
  | "unknown-account"
  | "ignored-account"
  | "zero-amount";

export type NormalizeResult =
  | { kind: "txn"; txn: PlaidNormalizedTxn }
  | { kind: "skip"; reason: NormalizeSkipReason; transactionId: string };

/** How a Plaid `account_id` resolves to a Budgts account. */
export interface AccountMapEntry {
  /** `plaid_accounts.id` (our uuid PK). */
  plaidAccountRowId: string;
  /** `plaid_accounts.account_id` → the mapped `accounts.id`. */
  budgtsAccountId: string;
  /** `link_state = 'ignored'` — skip this account's transactions entirely. */
  ignored: boolean;
}

export interface NormalizeCtx {
  accountMap: ReadonlyMap<string, AccountMapEntry>;
  /** The user's single currency, e.g. `"USD"`. */
  currency: string;
  /**
   * Resolve a transaction to a Budgts category id, or null for "leave
   * uncategorized". Consults per-merchant memory (`merchant_entity_id`) first,
   * then the static PFC map. Throws {@link UnknownPfcPrimaryError} on an
   * unrecognised primary; the adapter catches that and returns null.
   */
  resolveCategory: (args: {
    merchantEntityId: string | null;
    primary: string | null;
    detailed: string | null;
    confidence: string | null;
  }) => string | null;
}

/**
 * PlaidAdapter — turns a Plaid `Transaction` into a Budgts `PlaidNormalizedTxn`
 * (or a typed "skip"). Pure: all I/O (account map, category resolution) is
 * supplied via `ctx`. Design §12–13.
 *
 * Sign convention: Plaid `amount` is positive when money leaves the account
 * (spend / transfer-out) and negative when it enters (income / refund /
 * transfer-in). We split that into `amount` (integer minor units, > 0) +
 * `direction`.
 */
import { parseMoney } from "@/lib/budget/money";
import { UnknownPfcPrimaryError } from "./category-map";
import { resolveEventRole } from "./event-role";
import type {
  NormalizeCtx,
  NormalizeResult,
  NormalizeSkipReason,
  PlaidNormalizedTxn,
  PlaidTxnInput,
} from "./types";

const TRANSFER_PRIMARIES = new Set(["TRANSFER_IN", "TRANSFER_OUT"]);

/** Plaid `date` (YYYY-MM-DD) or `datetime` (ISO) → an ISO 8601 UTC string. */
function toIso(datetime: string | null | undefined, date: string): string {
  if (datetime) return new Date(datetime).toISOString();
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toIsoOrNull(datetime: string | null | undefined, date: string | null | undefined): string | null {
  if (datetime) return new Date(datetime).toISOString();
  if (date) return new Date(`${date}T00:00:00.000Z`).toISOString();
  return null;
}

export function normalizePlaidTxn(input: PlaidTxnInput, ctx: NormalizeCtx): NormalizeResult {
  const skip = (reason: NormalizeSkipReason): NormalizeResult => ({
    kind: "skip",
    reason,
    transactionId: input.transaction_id,
  });

  const acct = ctx.accountMap.get(input.account_id);
  if (!acct) return skip("unknown-account");
  if (acct.ignored) return skip("ignored-account");

  if (input.amount === 0) return skip("zero-amount");

  // Plaid's documented convention: amount > 0 = outflow. An `inverted`
  // account's feed contradicts that convention, so the outflow test flips.
  const rawIsOutflow = input.amount > 0;
  const isOutflow = acct.signConvention === "inverted" ? !rawIsOutflow : rawIsOutflow;
  const direction: "debit" | "credit" = isOutflow ? "debit" : "credit";
  // `.toFixed(2)` kills float artifacts (Plaid sends clean 2dp numbers, but be safe).
  const amount = parseMoney(Math.abs(input.amount).toFixed(2));

  const pfc = input.personal_finance_category ?? null;
  const primary = pfc?.primary ?? null;
  const detailed = pfc?.detailed ?? null;
  const confidence = pfc?.confidence_level ?? null;

  const isTransfer = primary != null && TRANSFER_PRIMARIES.has(primary);

  let categoryId: string | null = null;
  if (!isTransfer) {
    try {
      categoryId = ctx.resolveCategory({
        merchantEntityId: input.merchant_entity_id ?? null,
        merchantName: input.merchant_name ?? null,
        description: input.name ?? null,
        primary,
        detailed,
        confidence,
      });
    } catch (e) {
      // An unrecognised Plaid taxonomy value must not break a sync — land the
      // row uncategorised; the mapper's throw still surfaces it in tests / logs.
      if (!(e instanceof UnknownPfcPrimaryError)) throw e;
      categoryId = null;
    }
  }

  const eventRole = resolveEventRole({ primary, detailed, isTransfer, direction });

  // Currency: Plaid amounts are already in the account's currency. If that
  // account's currency isn't the user's, the row is real but its amount can't
  // be summed with the rest — land it as `pending_review` so it's excluded from
  // rollups (qualify.countsForMonth) and surfaced for the user to deal with.
  const txnCurrency = input.iso_currency_code ?? input.unofficial_currency_code ?? null;
  const currencyMismatch = txnCurrency != null && txnCurrency !== ctx.currency;
  const pendingReason: "currency_mismatch" | "sign_convention_unknown" | null = currencyMismatch
    ? "currency_mismatch"
    : acct.signConvention === "unknown"
      ? "sign_convention_unknown"
      : null;

  const txn: PlaidNormalizedTxn = {
    accountId: acct.budgtsAccountId,
    plaidAccountRowId: acct.plaidAccountRowId,
    categoryId,
    amount,
    direction,
    occurredAt: toIso(input.datetime, input.date),
    description: input.merchant_name || input.name,
    note: null,
    isTransfer,
    eventRole,
    source: "bank",
    sourceRef: input.transaction_id,
    userCategorized: false,
    status: pendingReason ? "pending_review" : "confirmed",
    pendingReason,
    pending: input.pending === true,
    pendingSourceRef: input.pending_transaction_id ?? null,
    merchantName: input.merchant_name ?? null,
    merchantEntityId: input.merchant_entity_id ?? null,
    plaidCategoryPrimary: primary,
    plaidCategoryDetailed: detailed,
    plaidPfcConfidence: confidence,
    authorizedAt: toIsoOrNull(input.authorized_datetime, input.authorized_date),
    raw: input,
  };
  return { kind: "txn", txn };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Direction } from "@/lib/validation/transaction";

/** The fields `updateTransaction` writes on every edit -- exactly today's
 * set, never `source`/`sourceRef`/`status` (those are creation-only). */
export interface UpdateTransactionFields {
  accountId: string;
  categoryId: string | null;
  amount: number;
  direction: Direction;
  occurredAt: string;
  description: string;
  note: string | null;
  isTransfer: boolean;
}

export type UpdateTransactionOutcome = { outcome: "ok" } | { outcome: "missing" } | { outcome: "conflict" };

/** What an edit decides against, read once: see {@link readObservedRow}. */
export interface ObservedRow {
  isTransfer: boolean;
  accountId: string;
  /** Imported from a bank (`source = 'bank'`, or still linked to a Plaid account): its account never changes on edit. */
  bankSourced: boolean;
}

/**
 * The row's current `is_transfer`, account and origin in one read, or `null` if it doesn't exist / isn't visible to
 * this client (RLS). Handing it to {@link updateTransactionRow} makes the write conditional on exactly this state, so
 * a "keep the account" or "move it" decision can never land on a row whose account changed in between.
 */
export async function readObservedRow(supabase: SupabaseClient, id: string): Promise<ObservedRow | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("is_transfer, account_id, source, plaid_account_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    isTransfer: data.is_transfer as boolean,
    accountId: data.account_id as string,
    bankSourced: data.source === "bank" || data.plaid_account_id != null,
  };
}

/**
 * One optimistic conditional write: succeeds only if `is_transfer` is
 * still `observed.isTransfer` AND the row is still on `observed.accountId`
 * at write time. `transfer_user_set` is set to `true` only when
 * `fields.isTransfer` genuinely differs from the observed value -- never
 * written `false` over an existing `true` (the field is omitted entirely,
 * not set, when unchanged). This is the only place `transfer_user_set` is
 * ever written (design: 2026-09-12 transfer-ownership §4).
 *
 * The same conditional branch also clears `transfer_pair_id` on THIS row
 * (design: 2026-09-16 paired-transfer detection, user-override lifecycle)
 * -- a user's explicit transfer decision must never leave a stale
 * relationship pointer sitting next to it. This is single-row only: the
 * partner leg's now-one-sided `transfer_pair_id` is cleared separately, by
 * the paired-transfer pass's own reconciliation step on its next run, not
 * here -- this function has no reach across rows, by design, and stays
 * exactly as narrow as it already was for `transfer_user_set`.
 */
export async function attemptConditionalUpdate(
  supabase: SupabaseClient,
  id: string,
  observed: Pick<ObservedRow, "isTransfer" | "accountId">,
  fields: UpdateTransactionFields,
): Promise<"ok" | "conflict"> {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      account_id: fields.accountId,
      category_id: fields.categoryId,
      amount: fields.amount,
      direction: fields.direction,
      occurred_at: fields.occurredAt,
      description: fields.description,
      note: fields.note,
      is_transfer: fields.isTransfer,
      ...(fields.isTransfer !== observed.isTransfer ? { transfer_user_set: true, transfer_pair_id: null } : {}),
    })
    .eq("id", id)
    .eq("is_transfer", observed.isTransfer)
    .eq("account_id", observed.accountId)
    .select("id");
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? "ok" : "conflict";
}

/**
 * Optimistic conditional update, genuinely atomic for the properties that
 * matter: the write only succeeds if `is_transfer` and the account are still
 * what was observed when the caller decided what to change. A plain
 * read-then-write is NOT atomic and must never be described as
 * self-correcting -- see spec §4's traced silent-loss sequence (a
 * concurrent sync's change can be silently reverted by a write that
 * already decided "no change" against stale data).
 *
 * `observed` is the caller's own {@link readObservedRow} (the edit command
 * reads once, decides the account rule against it, and passes it here);
 * without it this reads the row itself. On a zero-row write it re-reads:
 * gone -> `missing`; account changed -> `conflict` (the account decision was
 * made against the old one, so never retried); only `is_transfer` changed ->
 * one retry against the fresh value, recomputing `transfer_user_set` from
 * it. If the retry also affects zero rows, stops and reports a conflict
 * rather than looping or silently applying a decision made against stale
 * data.
 */
export async function updateTransactionRow(
  supabase: SupabaseClient,
  id: string,
  fields: UpdateTransactionFields,
  observed?: ObservedRow,
): Promise<UpdateTransactionOutcome> {
  const seen = observed ?? (await readObservedRow(supabase, id));
  if (seen === null) return { outcome: "missing" };

  const first = await attemptConditionalUpdate(supabase, id, seen, fields);
  if (first === "ok") return { outcome: "ok" };

  const reread = await readObservedRow(supabase, id);
  if (reread === null) return { outcome: "missing" };
  if (reread.accountId !== seen.accountId) return { outcome: "conflict" };

  const second = await attemptConditionalUpdate(supabase, id, reread, fields);
  return second === "ok" ? { outcome: "ok" } : { outcome: "conflict" };
}

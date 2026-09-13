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

/**
 * The row's current `is_transfer`, or `null` if it doesn't exist / isn't
 * visible to this client (RLS, for the real request-scoped client).
 */
export async function readObservedIsTransfer(supabase: SupabaseClient, id: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("transactions").select("is_transfer").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data.is_transfer as boolean) : null;
}

/**
 * One optimistic conditional write: succeeds only if `is_transfer` is
 * still `observed` at write time. `transfer_user_set` is set to `true`
 * only when `fields.isTransfer` genuinely differs from `observed` --
 * never written `false` over an existing `true` (the field is omitted
 * entirely, not set, when unchanged). This is the only place
 * `transfer_user_set` is ever written (design: 2026-09-12
 * transfer-ownership §4).
 */
export async function attemptConditionalUpdate(
  supabase: SupabaseClient,
  id: string,
  observed: boolean,
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
      ...(fields.isTransfer !== observed ? { transfer_user_set: true } : {}),
    })
    .eq("id", id)
    .eq("is_transfer", observed)
    .select("id");
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? "ok" : "conflict";
}

/**
 * Optimistic conditional update, genuinely atomic for the property that
 * matters: the write only succeeds if `is_transfer` is still what was
 * observed when the caller decided whether to change it. A plain
 * read-then-write is NOT atomic and must never be described as
 * self-correcting -- see spec §4's traced silent-loss sequence (a
 * concurrent sync's change can be silently reverted by a write that
 * already decided "no change" against stale data). On a genuine conflict
 * (`is_transfer` changed between the read and the write), re-reads once
 * and retries against the fresh value -- recomputing `transfer_user_set`
 * against that fresh value, not the stale one. If the retry also affects
 * zero rows, stops and reports a conflict rather than looping or
 * silently applying a decision made against stale data.
 */
export async function updateTransactionRow(
  supabase: SupabaseClient,
  id: string,
  fields: UpdateTransactionFields,
): Promise<UpdateTransactionOutcome> {
  const observed = await readObservedIsTransfer(supabase, id);
  if (observed === null) return { outcome: "missing" };

  const first = await attemptConditionalUpdate(supabase, id, observed, fields);
  if (first === "ok") return { outcome: "ok" };

  // Zero rows affected: distinguish "row vanished / no longer visible"
  // from "is_transfer changed under us" (a genuine conflict) by re-reading.
  const reread = await readObservedIsTransfer(supabase, id);
  if (reread === null) return { outcome: "missing" };

  const second = await attemptConditionalUpdate(supabase, id, reread, fields);
  return second === "ok" ? { outcome: "ok" } : { outcome: "conflict" };
}

/**
 * Manual-transaction commands: the one implementation behind the web Server Actions (`src/server/transactions.ts`) and the
 * native routes (`/api/mobile/transactions*`). Validation is the shared `transactionFormSchema`; creation goes through
 * `landTransaction` (the single insert path for every source); edits use the optimistic conditional write in
 * `updateTransactionRow` (so a concurrent bank sync can never be silently reverted).
 *
 * Every function takes the CALLER'S Supabase client, so RLS scopes the work to that user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { failed, invalid, type Failed, type Invalid } from "@/lib/command-result";
import { landTransaction, normalizeManual, supabaseTransactionStore } from "@/lib/ingestion";
import { transactionFormSchema } from "@/lib/validation/transaction";
import { updateTransactionRow } from "@/server/transaction-update";

/** JSON callers send `null` for "no category"; the form schema takes an empty string for that. */
function toFormInput(raw: unknown): Record<string, unknown> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { ...r, categoryId: r.categoryId ?? "" };
}

/** A client-generated id that makes a retried create land once (see `createManualTransaction`). */
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export type CreateResult = { ok: true; id: string } | Invalid | Failed;

/**
 * Creates a manual transaction. When the caller supplies a `requestId` (a native client retrying over a flaky network) it is
 * stored as the `source_ref`, so `landTransaction`'s `(user_id, source, source_ref)` dedupe makes the retry return the row that
 * already landed instead of inserting a second one.
 */
export async function createManualTransaction(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown,
  requestId?: string,
): Promise<CreateResult> {
  const parsed = transactionFormSchema.safeParse(toFormInput(raw));
  if (!parsed.success) return invalid(parsed.error.issues);
  if (requestId !== undefined && !REQUEST_ID.test(requestId)) {
    return { ok: false, error: "invalid", fieldErrors: { requestId: "Invalid request id" } };
  }

  const n = normalizeManual(parsed.data);
  try {
    const row = await landTransaction(
      supabaseTransactionStore(supabase),
      userId,
      requestId ? { ...n, sourceRef: `client:${requestId}` } : n,
    );
    return { ok: true, id: row.id };
  } catch (e) {
    return failed(e, "Could not save the transaction");
  }
}

export type UpdateResult = { ok: true } | Invalid | { ok: false; error: "missing" } | { ok: false; error: "conflict" } | Failed;

export async function updateManualTransaction(supabase: SupabaseClient, id: string, raw: unknown): Promise<UpdateResult> {
  const parsed = transactionFormSchema.safeParse(toFormInput(raw));
  if (!parsed.success) return invalid(parsed.error.issues);

  const n = normalizeManual(parsed.data);
  try {
    const result = await updateTransactionRow(supabase, id, {
      accountId: n.accountId,
      categoryId: n.categoryId,
      amount: n.amount,
      direction: n.direction,
      occurredAt: n.occurredAt,
      description: n.description,
      note: n.note,
      isTransfer: n.isTransfer,
    });
    if (result.outcome === "missing") return { ok: false, error: "missing" };
    if (result.outcome === "conflict") return { ok: false, error: "conflict" };
    return { ok: true };
  } catch (e) {
    return failed(e, "Could not update the transaction");
  }
}

export type DeleteResult = { ok: true } | { ok: false; error: "missing" } | Failed;

export async function deleteTransactionById(supabase: SupabaseClient, id: string): Promise<DeleteResult> {
  const { data, error } = await supabase.from("transactions").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  if (!data?.length) return { ok: false, error: "missing" };
  return { ok: true };
}

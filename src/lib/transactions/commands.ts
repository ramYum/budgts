/**
 * Manual-transaction commands: the one implementation behind the web Server Actions (`src/server/transactions.ts`) and the
 * native routes (`/api/mobile/transactions*`). Validation is the shared `transactionFormSchema`; creation goes through
 * `landTransaction` (the single insert path for every source); edits use the optimistic conditional write in
 * `updateTransactionRow` (so a concurrent bank sync can never be silently reverted).
 *
 * Every function takes the CALLER'S Supabase client, so RLS scopes the work to that user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { failed, invalid, type Failed, type Invalid, type Locked, type MissingReference } from "@/lib/command-result";
import { lockedOr, missingOrLocked, referencesVisible } from "@/lib/ownership";
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

export type CreateResult = { ok: true; id: string } | Invalid | MissingReference | Locked | Failed;

/** The account and category a manual transaction points at must be the caller's own (see src/lib/ownership.ts). */
async function referencesOwned(
  supabase: SupabaseClient,
  n: { accountId: string; categoryId: string | null },
): Promise<MissingReference | Failed | null> {
  const [account, category] = await Promise.all([
    referencesVisible(supabase, "accounts", [n.accountId]),
    referencesVisible(supabase, "categories", [n.categoryId]),
  ]);
  for (const r of [account, category]) {
    if (!r.ok) return r.error === "missing" ? { ok: false, error: "missing_reference" } : r;
  }
  return null;
}

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
  const refused = await referencesOwned(supabase, n);
  if (refused) return refused;
  try {
    const row = await landTransaction(
      supabaseTransactionStore(supabase),
      userId,
      requestId ? { ...n, sourceRef: `client:${requestId}` } : n,
    );
    return { ok: true, id: row.id };
  } catch (e) {
    return lockedOr(supabase, failed(e, "Could not save the transaction"));
  }
}

export type UpdateResult =
  | { ok: true }
  | Invalid
  | { ok: false; error: "missing" }
  | Locked
  | MissingReference
  | { ok: false; error: "conflict" }
  | Failed;

export async function updateManualTransaction(supabase: SupabaseClient, id: string, raw: unknown): Promise<UpdateResult> {
  const parsed = transactionFormSchema.safeParse(toFormInput(raw));
  if (!parsed.success) return invalid(parsed.error.issues);

  const n = normalizeManual(parsed.data);
  const refused = await referencesOwned(supabase, n);
  if (refused) return refused;
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
    if (result.outcome === "missing") return missingOrLocked(supabase);
    // Under the deletion lock the row still reads but both conditional writes match nothing, which looks exactly like
    // a concurrent change: ask the guard before calling it a conflict.
    if (result.outcome === "conflict") return lockedOr(supabase, { ok: false, error: "conflict" } as const);
    return { ok: true };
  } catch (e) {
    return failed(e, "Could not update the transaction");
  }
}

export type DeleteResult = { ok: true } | { ok: false; error: "missing" } | Locked | Failed;

export async function deleteTransactionById(supabase: SupabaseClient, id: string): Promise<DeleteResult> {
  const { data, error } = await supabase.from("transactions").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  if (!data?.length) return missingOrLocked(supabase);
  return { ok: true };
}

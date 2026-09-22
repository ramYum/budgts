"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createManualTransaction,
  deleteTransactionById,
  updateManualTransaction,
} from "@/lib/transactions/commands";

export type TxnActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

const MISSING_ROW = "That transaction no longer exists. Refresh and try again.";
const CONFLICT_ROW = "This transaction changed while you were editing it. Refresh and try again.";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

function revalidate() {
  revalidatePath("/transactions");
  revalidatePath("/");
}

/** The web adapters below only translate FormData in and `TxnActionState` out: the rules live in `@/lib/transactions/commands`,
 * shared with the native `/api/mobile/transactions*` routes. */
export async function createTransaction(
  _prev: TxnActionState,
  formData: FormData,
): Promise<TxnActionState> {
  const { supabase, user } = await requireUser();
  const result = await createManualTransaction(supabase, user.id, Object.fromEntries(formData));
  if (!result.ok) return result.error === "invalid" ? { fieldErrors: result.fieldErrors } : { error: result.message };
  revalidate();
  return { ok: true };
}

export async function updateTransaction(
  _prev: TxnActionState,
  formData: FormData,
): Promise<TxnActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing transaction id" };

  const { supabase } = await requireUser();
  const result = await updateManualTransaction(supabase, id, Object.fromEntries(formData));
  if (!result.ok) {
    if (result.error === "invalid") return { fieldErrors: result.fieldErrors };
    // RLS makes another user's rows invisible rather than erroring, and a genuine optimistic-concurrency conflict is a
    // distinct case from that — see transaction-update.ts for the conditional-write mechanism.
    if (result.error === "missing") return { error: MISSING_ROW };
    if (result.error === "conflict") return { error: CONFLICT_ROW };
    return { error: result.message };
  }
  revalidate();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<TxnActionState> {
  if (!id) return { error: "Missing transaction id" };
  const { supabase } = await requireUser();
  const result = await deleteTransactionById(supabase, id);
  if (!result.ok) return { error: result.error === "missing" ? MISSING_ROW : result.message };
  revalidate();
  return { ok: true };
}

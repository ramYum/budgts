"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { landTransaction, normalizeManual, supabaseTransactionStore } from "@/lib/ingestion";
import { createClient } from "@/lib/supabase/server";
import { transactionFormSchema } from "@/lib/validation/transaction";

export type TxnActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

const MISSING_ROW = "That transaction no longer exists. Refresh and try again.";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    out[key] ??= i.message;
  }
  return out;
}

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

export async function createTransaction(
  _prev: TxnActionState,
  formData: FormData,
): Promise<TxnActionState> {
  const raw = Object.fromEntries(formData);
  const parsed = transactionFormSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const { supabase, user } = await requireUser();
  try {
    await landTransaction(
      supabaseTransactionStore(supabase),
      user.id,
      normalizeManual(parsed.data),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the transaction" };
  }
  revalidate();
  return { ok: true };
}

export async function updateTransaction(
  _prev: TxnActionState,
  formData: FormData,
): Promise<TxnActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing transaction id" };

  const raw = Object.fromEntries(formData);
  const parsed = transactionFormSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const { supabase } = await requireUser();
  const n = normalizeManual(parsed.data);
  const { data, error } = await supabase
    .from("transactions")
    .update({
      account_id: n.accountId,
      category_id: n.categoryId,
      amount: n.amount,
      direction: n.direction,
      occurred_at: n.occurredAt,
      description: n.description,
      note: n.note,
      is_transfer: n.isTransfer,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  // RLS makes another user's rows invisible rather than erroring, so a zero-row
  // update is indistinguishable from success unless we check.
  if (!data?.length) return { error: MISSING_ROW };

  revalidate();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<TxnActionState> {
  if (!id) return { error: "Missing transaction id" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: MISSING_ROW };
  revalidate();
  return { ok: true };
}

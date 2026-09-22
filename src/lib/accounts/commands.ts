/**
 * Account commands (create, rename / retype, archive) — shared by the web Server Actions (`src/server/accounts.ts`) and the
 * native `/api/mobile/accounts*` routes. Validation is the shared `accountFormSchema`. Callers pass the CALLER'S Supabase
 * client, so RLS scopes every write and another user's id simply matches nothing (`missing`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalid, type Failed, type Invalid } from "@/lib/command-result";
import { accountFormSchema } from "@/lib/validation/account";

export type CreateAccountResult = { ok: true; id: string } | Invalid | Failed;

export async function createAccount(supabase: SupabaseClient, userId: string, raw: unknown): Promise<CreateAccountResult> {
  const parsed = accountFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);

  const { data, error } = await supabase
    .from("accounts")
    .insert({ user_id: userId, ...parsed.data })
    .select("id")
    .single();
  if (error) return { ok: false, error: "failed", message: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export type AccountWriteResult = { ok: true } | Invalid | { ok: false; error: "missing" } | Failed;

export async function updateAccount(supabase: SupabaseClient, id: string, raw: unknown): Promise<AccountWriteResult> {
  const parsed = accountFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);

  const { data, error } = await supabase.from("accounts").update(parsed.data).eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "missing" };
}

export async function setAccountArchived(
  supabase: SupabaseClient,
  id: string,
  archived: boolean,
): Promise<Exclude<AccountWriteResult, Invalid>> {
  const { data, error } = await supabase.from("accounts").update({ is_archived: archived }).eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "missing" };
}

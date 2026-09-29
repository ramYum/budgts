"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import {
  createAccount as createAccountCommand,
  setAccountArchived as archiveCommand,
  updateAccount as updateCommand,
} from "@/lib/accounts/commands";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { LOCKED_MESSAGE } from "@/lib/ownership";

export type AccountActionState = { error?: string; fieldError?: string; ok?: boolean };

const MISSING_ACCOUNT = "That account no longer exists. Refresh and try again.";

async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

const firstFieldError = (fieldErrors: Record<string, string>) => Object.values(fieldErrors)[0] ?? "Invalid account";

/** Web adapters: FormData in, `AccountActionState` out. The rules live in
 * `@/lib/accounts/commands`, shared with the native `/api/mobile/accounts*`
 * routes. */
export async function createAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const { user, supabase } = await withUser();
  const result = await createAccountCommand(supabase, user.id, Object.fromEntries(formData));
  if (!result.ok) {
    if (result.error === "invalid") return { fieldError: firstFieldError(result.fieldErrors) };
    return { error: result.error === "locked" ? LOCKED_MESSAGE : result.message };
  }
  revalidateUserData();
  return { ok: true };
}

export async function updateAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing account id" };

  const { supabase } = await withUser();
  const result = await updateCommand(supabase, id, Object.fromEntries(formData));
  if (!result.ok) {
    if (result.error === "invalid") return { fieldError: firstFieldError(result.fieldErrors) };
    return { error: result.error === "missing" ? MISSING_ACCOUNT : result.error === "locked" ? LOCKED_MESSAGE : result.message };
  }
  revalidateUserData();
  return { ok: true };
}

export async function setAccountArchived(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "1";
  if (!id) return { error: "Missing account id" };

  const { supabase } = await withUser();
  const result = await archiveCommand(supabase, id, archived);
  if (!result.ok) {
    return { error: result.error === "missing" ? MISSING_ACCOUNT : result.error === "locked" ? LOCKED_MESSAGE : result.message };
  }
  revalidateUserData();
  return { ok: true };
}

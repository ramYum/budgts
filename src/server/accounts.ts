"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { accountFormSchema } from "@/lib/validation/account";

export type AccountActionState = { error?: string; fieldError?: string; ok?: boolean };


async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

export async function createAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = accountFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message ?? "Invalid account" };

  const { user, supabase } = await withUser();
  const { error } = await supabase.from("accounts").insert({ user_id: user.id, ...parsed.data });
  if (error) return { error: error.message };
  revalidateUserData();
  return { ok: true };
}

export async function updateAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing account id" };
  const parsed = accountFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message ?? "Invalid account" };

  const { supabase } = await withUser();
  const { error } = await supabase.from("accounts").update(parsed.data).eq("id", id);
  if (error) return { error: error.message };
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
  const { error } = await supabase.from("accounts").update({ is_archived: archived }).eq("id", id);
  if (error) return { error: error.message };
  revalidateUserData();
  return { ok: true };
}

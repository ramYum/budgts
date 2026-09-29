"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  createCategory as createCategoryCommand,
  setCategoryArchived as setCategoryArchivedCommand,
  updateCategory as updateCategoryCommand,
} from "@/lib/categories/commands";

export type CategoryActionState = {
  error?: string;
  fieldError?: string;
  ok?: boolean;
  /** Set on a successful create, so callers can immediately use the new row. */
  id?: string;
  name?: string;
};

// The rules live in `@/lib/categories/commands`, shared with the native `/api/mobile/categories*` routes; these adapt them
// to forms.

async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

const GONE = "That category no longer exists. Refresh and try again.";

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const { user, supabase } = await withUser();
  const result = await createCategoryCommand(supabase, user.id, Object.fromEntries(formData));
  if (!result.ok) {
    return result.error === "invalid"
      ? { fieldError: Object.values(result.fieldErrors)[0] ?? "Invalid category" }
      : { error: result.message };
  }
  revalidateUserData();
  return { ok: true, id: result.id, name: result.name };
}

export async function updateCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing category id" };
  const { supabase } = await withUser();
  const result = await updateCategoryCommand(supabase, id, Object.fromEntries(formData));
  if (!result.ok) {
    if (result.error === "invalid") return { fieldError: Object.values(result.fieldErrors)[0] ?? "Invalid category" };
    return { error: result.error === "missing" ? GONE : result.message };
  }
  revalidateUserData();
  return { ok: true };
}

export async function setCategoryArchived(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "1";
  if (!id) return { error: "Missing category id" };
  const { supabase } = await withUser();
  const result = await setCategoryArchivedCommand(supabase, id, archived);
  if (!result.ok) return { error: result.error === "missing" ? GONE : result.message };
  revalidateUserData();
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { categoryFormSchema } from "@/lib/validation/category";

export type CategoryActionState = { error?: string; fieldError?: string; ok?: boolean };

function revalidate() {
  for (const p of ["/", "/budgets", "/transactions", "/settings"]) revalidatePath(p);
}

async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsed = categoryFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message ?? "Invalid category" };

  const { user, supabase } = await withUser();
  const { error } = await supabase.from("categories").insert({ user_id: user.id, ...parsed.data });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing category id" };
  const parsed = categoryFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message ?? "Invalid category" };

  const { supabase } = await withUser();
  const { error } = await supabase.from("categories").update(parsed.data).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
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
  const { error } = await supabase
    .from("categories")
    .update({ is_archived: archived })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

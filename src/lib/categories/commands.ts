/**
 * Category commands (create, edit, archive / restore): the one implementation behind the web Server Actions
 * (`src/server/categories.ts`) and the native `/api/mobile/categories*` routes. Validation is the shared
 * `categoryFormSchema`. Callers pass the CALLER'S Supabase client, so RLS scopes every write and another user's id matches
 * nothing (`missing`). Moved out of the web actions (2026-09-29, Stage 2B) without changing a rule.
 *
 * A native caller may send a `requestId` (a UUID it generated) with a create: it becomes the row's primary key, so a retry
 * after a lost response returns the category that landed instead of creating a second one with the same name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalid, type Failed, type Invalid } from "@/lib/command-result";
import { categoryFormSchema } from "@/lib/validation/category";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";

export type CreateCategoryResult = { ok: true; id: string; name: string } | Invalid | Failed;
export type CategoryWriteResult = { ok: true } | Invalid | { ok: false; error: "missing" } | Failed;

export async function createCategory(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown,
  requestId?: string,
): Promise<CreateCategoryResult> {
  const parsed = categoryFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (requestId !== undefined && !UUID.test(requestId)) {
    return { ok: false, error: "invalid", fieldErrors: { requestId: "Invalid request id" } };
  }

  const row: Record<string, unknown> = { user_id: userId, ...parsed.data };
  const { data: created, error } = await supabase
    .from("categories")
    .insert(requestId ? { id: requestId, ...row } : row)
    .select("id, name")
    .single();
  if (!error && created) {
    const c = created as { id: string; name: string };
    return { ok: true, id: c.id, name: c.name };
  }
  if (requestId && error?.code === UNIQUE_VIOLATION) {
    const { data: landed } = await supabase.from("categories").select("id, name").eq("id", requestId).maybeSingle();
    if (landed) {
      const c = landed as { id: string; name: string };
      return { ok: true, id: c.id, name: c.name };
    }
  }
  return { ok: false, error: "failed", message: error?.message ?? "Could not create the category." };
}

export async function updateCategory(supabase: SupabaseClient, id: string, raw: unknown): Promise<CategoryWriteResult> {
  const parsed = categoryFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);

  const { data, error } = await supabase.from("categories").update(parsed.data).eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "missing" };
}

export async function setCategoryArchived(
  supabase: SupabaseClient,
  id: string,
  archived: boolean,
): Promise<Exclude<CategoryWriteResult, Invalid>> {
  const { data, error } = await supabase.from("categories").update({ is_archived: archived }).eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "missing" };
}

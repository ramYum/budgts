/**
 * PATCH /api/mobile/categories/:id — either `{ archived: boolean }` (archive / restore) or `{ name, kind, color }` (rename,
 * recolour, change kind: exactly what the web's edit form allows). Adapters over `src/lib/categories/commands.ts`, shared
 * with the web Server Actions. Another user's id is invisible under RLS → 404 `not_found`.
 */
import { setCategoryArchived, updateCategory } from "@/lib/categories/commands";
import { UUID_RE, mobileCommandError, mobileError, mobileJson, mobileRoute, readObject } from "@/lib/mobile/route";

export const PATCH = mobileRoute<{ id: string }>(async ({ supabase }, request, { params }) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return mobileError("not_found", 404);

  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);

  const result =
    typeof body.archived === "boolean"
      ? await setCategoryArchived(supabase, id, body.archived)
      : await updateCategory(supabase, id, body);
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

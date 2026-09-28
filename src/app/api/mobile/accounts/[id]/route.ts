/**
 * PATCH /api/mobile/accounts/:id — either `{ archived: boolean }` (archive / restore) or `{ name, type }` (rename / retype).
 * Adapters over `src/lib/accounts/commands.ts`. Another user's id is invisible under RLS → 404 `not_found`.
 */
import { setAccountArchived, updateAccount } from "@/lib/accounts/commands";
import { mobileCommandError, mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = mobileRoute<{ id: string }>(async ({ supabase }, request, { params }) => {
  const { id } = await params;
  if (!UUID.test(id)) return mobileError("not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return mobileError("invalid_body", 400);

  const archived = (body as { archived?: unknown }).archived;
  const result =
    typeof archived === "boolean" ? await setAccountArchived(supabase, id, archived) : await updateAccount(supabase, id, body);
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

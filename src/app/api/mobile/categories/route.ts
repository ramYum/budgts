/**
 * GET  /api/mobile/categories — the caller's active categories (the category picker).
 * POST /api/mobile/categories — `{ name, kind:"expense"|"income", color:"#rrggbb", requestId?:<uuid> }` → 201 `{ id, name }`.
 *   A retry with the same `requestId` returns the category that already landed.
 *
 * Settings → Categories reads `GET /api/mobile/settings/categories`; edits go to `PATCH /api/mobile/categories/:id`. Adapters
 * over `src/lib/mobile/reads.ts` and `src/lib/categories/commands.ts` (shared with the web Server Actions).
 */
import { createCategory } from "@/lib/categories/commands";
import { MOBILE_API_VERSION, loadCategories } from "@/lib/mobile/reads";
import { mobileCommandError, mobileError, mobileJson, mobileRoute, readObject, requestIdOf } from "@/lib/mobile/route";

export const GET = mobileRoute(async ({ supabase }) => {
  return mobileJson({ version: MOBILE_API_VERSION, categories: await loadCategories(supabase) });
});

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);
  const requestId = requestIdOf(body);
  if (requestId === false) return mobileError("invalid", 422, { fieldErrors: { requestId: "Invalid request id" } });

  const result = await createCategory(supabase, user.id, body, requestId);
  return result.ok ? mobileJson({ id: result.id, name: result.name }, 201) : mobileCommandError(result);
});

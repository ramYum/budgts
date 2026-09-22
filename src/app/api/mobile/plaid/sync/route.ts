/**
 * POST /api/mobile/plaid/sync — `{ itemId }`: "Sync now" for one connected Item. Adapter over
 * `syncPlaidItemForUser` (mobile-only-transition spec §4A), shared with the web `syncConnection` Server Action.
 */
import { syncPlaidItemForUser } from "@/lib/plaid/sync-commands";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }

  const itemId = (body as { itemId?: unknown } | null)?.itemId;
  if (typeof itemId !== "string" || !itemId) return mobileError("invalid", 422, { fieldErrors: { itemId: "Missing itemId" } });

  const result = await syncPlaidItemForUser(supabase, user.id, itemId);
  if (result.outcome === "item_not_found") return mobileError("not_found", 404);
  return mobileJson({ ok: true, ...(result.warning ? { warning: result.warning } : {}) });
});

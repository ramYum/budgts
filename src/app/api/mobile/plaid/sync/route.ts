/**
 * POST /api/mobile/plaid/sync — `{ itemId }` (Plaid's item id): "Sync now" for one connected Item, through the same
 * per-Item lease as the webhook and the sweep. Adapter over `syncConnectionFor`, shared with the web `syncConnection`.
 */
import { mobileError, mobileJson, mobileRoute, readJson } from "@/lib/mobile/route";
import { syncConnectionFor, type PlaidCommandResult } from "@/server/plaid/commands";

/** Maps a Plaid command result to the wire. `warning` is user-facing text (the work succeeded; a sync did not finish). */
function reply(result: PlaidCommandResult) {
  if (result.ok) return mobileJson({ ok: true, ...(result.warning ? { warning: result.warning } : {}) });
  if (result.error === "not_found") return mobileError("not_found", 404);
  if (result.error === "invalid") return mobileError("invalid", 422, { fieldErrors: { form: result.message } });
  return mobileError("unavailable", 503);
}

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  const body = (await readJson(request)) as { itemId?: unknown } | null;
  if (!body || typeof body !== "object") return mobileError("invalid_body", 400);
  const itemId = body.itemId;
  if (typeof itemId !== "string" || !itemId) return mobileError("invalid", 422, { fieldErrors: { itemId: "Missing itemId" } });
  return reply(await syncConnectionFor(supabase, user.id, itemId));
});

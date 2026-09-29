/**
 * POST /api/mobile/plaid/sync — `{ itemId }` (Plaid's item id): "Sync now" for one connected Item, through the same
 * per-Item lease as the webhook and the sweep. Adapter over `syncConnectionFor`, shared with the web `syncConnection`.
 */
import { mobilePlaidReply } from "@/lib/mobile/plaid-reply";
import { mobileError, mobileRoute, readJson } from "@/lib/mobile/route";
import { syncConnectionFor } from "@/server/plaid/commands";

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  const body = (await readJson(request)) as { itemId?: unknown } | null;
  if (!body || typeof body !== "object") return mobileError("invalid_body", 400);
  const itemId = body.itemId;
  if (typeof itemId !== "string" || !itemId) return mobileError("invalid", 422, { fieldErrors: { itemId: "Missing itemId" } });
  return mobilePlaidReply(await syncConnectionFor(supabase, user.id, itemId));
});

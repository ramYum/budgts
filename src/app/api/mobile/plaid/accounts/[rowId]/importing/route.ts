/**
 * PATCH /api/mobile/plaid/accounts/:rowId/importing — `{ importing: boolean }`: turn importing on/off for one linked Plaid
 * account (`plaid_accounts.id`). Turning back on resumes the same Budgts account and imports from then on. Adapter over
 * `setAccountImportingFor`, shared with the web `setAccountImportingAction`.
 */
import { mobilePlaidReply } from "@/lib/mobile/plaid-reply";
import { mobileError, mobileRoute, readJson } from "@/lib/mobile/route";
import { setAccountImportingFor } from "@/server/plaid/commands";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = mobileRoute<{ rowId: string }>(async ({ user, supabase }, request, { params }) => {
  const { rowId } = await params;
  if (!UUID.test(rowId)) return mobileError("not_found", 404);

  const body = (await readJson(request)) as { importing?: unknown } | null;
  if (!body || typeof body !== "object") return mobileError("invalid_body", 400);
  if (typeof body.importing !== "boolean") {
    return mobileError("invalid", 422, { fieldErrors: { importing: "Must be true or false" } });
  }
  return mobilePlaidReply(await setAccountImportingFor(supabase, user.id, rowId, body.importing));
});

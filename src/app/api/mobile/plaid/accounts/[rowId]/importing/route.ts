/**
 * PATCH /api/mobile/plaid/accounts/:rowId/importing — `{ importing: boolean }`: turn importing on/off for one linked Plaid
 * account (`plaid_accounts.id`). Turning back on resumes the same Budgts account and imports from then on. Adapter over
 * `setAccountImportingFor`, shared with the web `setAccountImportingAction`.
 */
import { mobileError, mobileJson, mobileRoute, readJson } from "@/lib/mobile/route";
import { setAccountImportingFor, type PlaidCommandResult } from "@/server/plaid/commands";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps a Plaid command result to the wire. `warning` is user-facing text (the work succeeded; a sync did not finish). */
function reply(result: PlaidCommandResult) {
  if (result.ok) return mobileJson({ ok: true, ...(result.warning ? { warning: result.warning } : {}) });
  if (result.error === "not_found") return mobileError("not_found", 404);
  if (result.error === "invalid") return mobileError("invalid", 422, { fieldErrors: { form: result.message } });
  return mobileError("unavailable", 503);
}

export const PATCH = mobileRoute<{ rowId: string }>(async ({ user, supabase }, request, { params }) => {
  const { rowId } = await params;
  if (!UUID.test(rowId)) return mobileError("not_found", 404);

  const body = (await readJson(request)) as { importing?: unknown } | null;
  if (!body || typeof body !== "object") return mobileError("invalid_body", 400);
  if (typeof body.importing !== "boolean") {
    return mobileError("invalid", 422, { fieldErrors: { importing: "Must be true or false" } });
  }
  return reply(await setAccountImportingFor(supabase, user.id, rowId, body.importing));
});

/**
 * Maps a Plaid command result (`src/server/plaid/commands.ts`) to the native wire, the same way for every
 * `/api/mobile/*` route that runs one. `warning` is user-facing text (the work succeeded; a sync did not finish or there
 * was nothing to do); an `invalid` message is the web's own wording, sent as the form error. A storage failure is a
 * generic 503, never its text.
 */
import type { PlaidCommandResult } from "@/server/plaid/commands";
import { mobileError, mobileJson } from "@/lib/mobile/route";

export function mobilePlaidReply(result: PlaidCommandResult): Response {
  if (result.ok) return mobileJson({ ok: true, ...(result.warning ? { warning: result.warning } : {}) });
  if (result.error === "not_found") return mobileError("not_found", 404);
  if (result.error === "invalid") return mobileError("invalid", 422, { fieldErrors: { form: result.message } });
  return mobileError("unavailable", 503);
}

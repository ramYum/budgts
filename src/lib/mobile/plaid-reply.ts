/**
 * Maps a Plaid command result (`src/server/plaid/commands.ts`) to the native wire, the same way for every
 * `/api/mobile/*` route that runs one. `warning` is user-facing text (the work succeeded; a sync did not finish or there
 * was nothing to do); an `invalid` message is the web's own wording, sent as the form error. A `not_found` carries the
 * command's own sentence (`message`: which thing is gone; every one is a fixed string in `src/server/plaid/commands.ts`).
 * A storage failure is a generic 503, never its text.
 *
 * `refusal: "refused"` (the account mapping): the command's `invalid` is a refusal over what the screen shows (already
 * imported, paused, no longer offered), answered as 422 `{ error: "refused", message }`, so the app can tell it from the
 * route's own input validation (`invalid`) and offer Refresh only for it.
 */
import type { PlaidCommandResult } from "@/server/plaid/commands";
import { mobileError, mobileJson } from "@/lib/mobile/route";

export function mobilePlaidReply(result: PlaidCommandResult, options: { refusal?: "refused" } = {}): Response {
  if (result.ok) return mobileJson({ ok: true, ...(result.warning ? { warning: result.warning } : {}) });
  if (result.error === "not_found") return mobileError("not_found", 404, { message: result.message });
  if (result.error === "invalid" && options.refusal) return mobileError(options.refusal, 422, { message: result.message });
  if (result.error === "invalid") return mobileError("invalid", 422, { fieldErrors: { form: result.message } });
  if (result.error === "locked") return mobileError("account_locked", 423);
  return mobileError("unavailable", 503);
}

/**
 * PATCH /api/mobile/plaid/accounts/:rowId/exclude — `{ excluded: boolean }`: the owner-only "exclude this account's
 * data from financial calculations" toggle. Adapter over the already-shared `setAccountCalculationExclusion`
 * (`src/server/plaid/account-exclusion.ts`; mobile-only-transition spec §4A). Excluding requires the account to
 * currently need review — `needs_review_required` (409) when it doesn't.
 */
import { setAccountCalculationExclusion } from "@/server/plaid/account-exclusion";
import { mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = mobileRoute<{ rowId: string }>(async ({ user, supabase }, request, { params }) => {
  const { rowId } = await params;
  if (!UUID.test(rowId)) return mobileError("not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }
  const excluded = (body as { excluded?: unknown } | null)?.excluded;
  if (typeof excluded !== "boolean") return mobileError("invalid", 422, { fieldErrors: { excluded: "Must be true or false" } });

  const result = await setAccountCalculationExclusion(supabase, user.id, rowId, excluded);
  if (result.outcome === "not_found") return mobileError("not_found", 404);
  if (result.outcome === "needs_review_required") return mobileError("needs_review_required", 409);
  return mobileJson({ ok: true });
});

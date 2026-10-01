/**
 * GET  /api/mobile/transactions?month=YYYY-MM&category=<uuid>&limit=<1-100>&cursor=<opaque>
 *   The month's ledger, newest first, keyset-paginated (`nextCursor`), with the same visibility rules as the web ledger.
 *   The month defaults to the user's current month in their own time zone.
 * POST /api/mobile/transactions — manual entry `{ accountId, categoryId|null, amount:"12.34", direction, occurredAt:"YYYY-MM-DD",
 *   description, note, isTransfer, requestId }` → 201 `{ id, replayed }`. `requestId` (client-generated) makes a retried create
 *   land once; `replayed: true` means it had already landed and this call's values were not applied.
 *
 * Adapters only: the rules are `src/lib/transactions/commands.ts` (shared with the web Server Action) and the read model is
 * `src/lib/mobile/reads.ts`. Bearer only; every query runs through the caller's own JWT (RLS).
 */
import { currentMonthKey } from "@/lib/budget/month";
import { MOBILE_API_VERSION, decodeCursor, loadTransactionsPage } from "@/lib/mobile/reads";
import { mobileCommandError, mobileError, mobileJson, mobileRoute, readJson } from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { createManualTransaction } from "@/lib/transactions/commands";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const GET = mobileRoute(async ({ user, supabase }, request) => {
  const params = new URL(request.url).searchParams;

  const requestedMonth = params.get("month");
  if (requestedMonth !== null && !MONTH.test(requestedMonth)) return mobileError("invalid_month", 422);

  const categoryId = params.get("category");
  if (categoryId && !UUID.test(categoryId)) return mobileError("invalid_category", 422);

  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return mobileError("invalid_cursor", 422);

  const requested = Number(params.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT;

  let month = requestedMonth;
  if (month === null) {
    const timeZone = await profileTimeZone(supabase, user.id);
    if (!timeZone) return mobileError("not_onboarded", 409);
    month = currentMonthKey(timeZone);
  }

  const page = await loadTransactionsPage(supabase, { month, categoryId, limit, cursor, plaidOn: plaidUiEnabled() });
  return mobileJson({ version: MOBILE_API_VERSION, month, ...page });
});

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return mobileError("invalid_body", 400);

  const requestId = (body as { requestId?: unknown }).requestId;
  const result = await createManualTransaction(supabase, user.id, body, typeof requestId === "string" ? requestId : undefined);
  return result.ok ? mobileJson({ id: result.id, replayed: result.replayed }, 201) : mobileCommandError(result);
});

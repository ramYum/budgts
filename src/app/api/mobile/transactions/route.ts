/**
 * GET  /api/mobile/transactions?month=YYYY-MM&category=<uuid>&search=<text>&limit=<1-100>&cursor=<opaque>
 *   The month's ledger, newest first, keyset-paginated (`nextCursor`), with the same visibility rules as the web ledger.
 * POST /api/mobile/transactions — manual entry `{ accountId, categoryId|null, amount:"12.34", direction, occurredAt:"YYYY-MM-DD",
 *   description, note, isTransfer, requestId }`. `requestId` (client-generated) makes a retried create land once.
 *
 * Adapters only: the rules are `src/lib/transactions/commands.ts` (shared with the web Server Action) and the read model is
 * `src/lib/mobile/reads.ts`. Bearer only; every query runs through the caller's own JWT (RLS).
 */
import { monthKey } from "@/lib/budget/month";
import { MOBILE_API_VERSION, decodeCursor, loadTransactionsPage } from "@/lib/mobile/reads";
import { mobileCommandError, mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { createManualTransaction } from "@/lib/transactions/commands";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const GET = mobileRoute(async ({ supabase }, request) => {
  const params = new URL(request.url).searchParams;

  const month = params.get("month") ?? monthKey(new Date());
  if (!MONTH.test(month)) return mobileError("invalid_month", 422);

  const categoryId = params.get("category");
  if (categoryId && !UUID.test(categoryId)) return mobileError("invalid_category", 422);

  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return mobileError("invalid_cursor", 422);

  const requested = Number(params.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const search = params.get("search")?.trim().slice(0, 100) || null;

  const page = await loadTransactionsPage(supabase, { month, categoryId, search, limit, cursor, plaidOn: plaidUiEnabled() });
  return mobileJson({ version: MOBILE_API_VERSION, month, ...page });
});

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return mobileError("invalid_body", 400);

  const requestId = (body as { requestId?: unknown }).requestId;
  const result = await createManualTransaction(supabase, user.id, body, typeof requestId === "string" ? requestId : undefined);
  return result.ok ? mobileJson({ id: result.id }, 201) : mobileCommandError(result);
});

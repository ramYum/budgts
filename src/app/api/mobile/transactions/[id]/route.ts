/**
 * PATCH  /api/mobile/transactions/:id — edit `{ accountId, categoryId|null, amount, direction, occurredAt, description, note,
 *   isTransfer }` (the full form, like the web edit). Optimistic: a concurrent change answers 409 `conflict`.
 * DELETE /api/mobile/transactions/:id
 *
 * Adapters over `src/lib/transactions/commands.ts`. Another user's id is simply invisible under RLS → 404 `not_found`.
 */
import { mobileCommandError, mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { deleteTransactionById, updateManualTransaction } from "@/lib/transactions/commands";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { id: string };

export const PATCH = mobileRoute<Params>(async ({ supabase }, request, { params }) => {
  const { id } = await params;
  if (!UUID.test(id)) return mobileError("not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return mobileError("invalid_body", 400);

  const result = await updateManualTransaction(supabase, id, body);
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

export const DELETE = mobileRoute<Params>(async ({ supabase }, _request, { params }) => {
  const { id } = await params;
  if (!UUID.test(id)) return mobileError("not_found", 404);

  const result = await deleteTransactionById(supabase, id);
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

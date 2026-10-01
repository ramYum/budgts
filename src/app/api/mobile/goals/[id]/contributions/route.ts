/**
 * POST /api/mobile/goals/:id/contributions — `{ kind:"add"|"withdraw", amount:"25", occurredAt:"YYYY-MM-DD", note:string|null,
 * requestId?:<uuid> }` → 201 `{ id, replayed }`. The amount is always positive; "withdraw" records it as money taken back
 * out, exactly like the web's "Withdraw / correct". A retry with the same `requestId` returns the contribution that
 * already landed (`replayed: true`, this call's values not applied), so a lost response can never double what is saved.
 *
 * Adapter over `src/lib/goals/commands.ts` (shared with the web Server Actions). Another user's goal → 404 `not_found`.
 */
import { addContribution } from "@/lib/goals/commands";
import {
  UUID_RE,
  mobileCommandError,
  mobileError,
  mobileJson,
  mobileRoute,
  nullsAsEmpty,
  readObject,
  requestIdOf,
} from "@/lib/mobile/route";

export const POST = mobileRoute<{ id: string }>(async ({ user, supabase }, request, { params }) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return mobileError("not_found", 404);

  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);
  if (body.kind !== "add" && body.kind !== "withdraw") {
    return mobileError("invalid", 422, { fieldErrors: { kind: "Choose add or withdraw" } });
  }
  const requestId = requestIdOf(body);
  if (requestId === false) return mobileError("invalid", 422, { fieldErrors: { requestId: "Invalid request id" } });

  const input = { ...nullsAsEmpty(body, ["note"]), goalId: id };
  const result = await addContribution(supabase, user.id, input, body.kind === "add" ? 1 : -1, requestId);
  return result.ok ? mobileJson({ id: result.id, replayed: result.replayed }, 201) : mobileCommandError(result);
});

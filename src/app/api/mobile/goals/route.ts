/**
 * GET  /api/mobile/goals — the Goals screen: each active goal's progress and the headline totals, from `loadGoals` (the
 *   reads and progress math the web Goals page renders), plus the user's `today` for a new contribution's date.
 * POST /api/mobile/goals — `{ name, targetAmount:"400", targetDate:"YYYY-MM-DD"|null, requestId?:<uuid> }` → 201
 *   `{ id, replayed }`. A retry with the same `requestId` returns the goal that already landed, `replayed: true` (this
 *   call's values were not applied).
 *
 * Adapters over `src/lib/goals/*` (shared with the web page and Server Actions). Bearer only; RLS scopes every query.
 */
import { todayDateKey } from "@/lib/budget/month";
import { createGoal } from "@/lib/goals/commands";
import { loadGoals } from "@/lib/goals/load-goals";
import { buildMobileGoals } from "@/lib/mobile/goals";
import {
  mobileCommandError,
  mobileError,
  mobileJson,
  mobileRoute,
  nullsAsEmpty,
  readObject,
  requestIdOf,
} from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const [timeZone, data] = await Promise.all([profileTimeZone(supabase, user.id), loadGoals(supabase, user.id)]);
  if (!timeZone) return mobileError("not_onboarded", 409);
  return mobileJson(buildMobileGoals(data, todayDateKey(timeZone)));
});

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);
  const requestId = requestIdOf(body);
  if (requestId === false) return mobileError("invalid", 422, { fieldErrors: { requestId: "Invalid request id" } });

  const result = await createGoal(supabase, user.id, nullsAsEmpty(body, ["targetDate"]), requestId);
  return result.ok ? mobileJson({ id: result.id, replayed: result.replayed }, 201) : mobileCommandError(result);
});

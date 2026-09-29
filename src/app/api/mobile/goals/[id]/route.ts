/**
 * PATCH /api/mobile/goals/:id — either `{ archived: boolean }` (archive / restore) or `{ name, targetAmount:"400",
 * targetDate:"YYYY-MM-DD"|null }` (edit). Adapters over `src/lib/goals/commands.ts`, shared with the web Server Actions.
 * Another user's id is invisible under RLS → 404 `not_found`.
 */
import { setGoalArchived, updateGoal } from "@/lib/goals/commands";
import {
  UUID_RE,
  mobileCommandError,
  mobileError,
  mobileJson,
  mobileRoute,
  nullsAsEmpty,
  readObject,
} from "@/lib/mobile/route";

export const PATCH = mobileRoute<{ id: string }>(async ({ supabase }, request, { params }) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return mobileError("not_found", 404);

  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);

  const result =
    typeof body.archived === "boolean"
      ? await setGoalArchived(supabase, id, body.archived)
      : await updateGoal(supabase, id, nullsAsEmpty(body, ["targetDate"]));
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

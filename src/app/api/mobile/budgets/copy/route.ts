/**
 * POST /api/mobile/budgets/copy — `{ month:"YYYY-MM" }`: copy last month's budgets into `month`.
 * 409 `nothing_to_copy` when last month had none. Adapter over `src/lib/budget/commands.ts`.
 */
import { copyBudgetsFromPreviousMonth } from "@/lib/budget/commands";
import { mobileCommandError, mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";

export const POST = mobileRoute(async ({ user, supabase }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }

  const month = (body as { month?: unknown } | null)?.month;
  const result = await copyBudgetsFromPreviousMonth(supabase, user.id, typeof month === "string" ? month : "");
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

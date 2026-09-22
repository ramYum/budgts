/**
 * GET /api/mobile/budgets?month=YYYY-MM — budget vs actual per expense category, from the same authoritative dashboard math as
 * Home (`loadMonthlyDashboard`); never partial numbers (a degraded read answers 503).
 * PUT /api/mobile/budgets — `{ categoryId, month, amount:"400" }`: set one category's month; an empty or zero amount clears it.
 *
 * Adapters over `src/lib/mobile/reads.ts` and `src/lib/budget/commands.ts` (shared with the web Server Action).
 */
import { loadMonthlyDashboard } from "@/lib/budget/home-data";
import { monthKey } from "@/lib/budget/month";
import { setBudget } from "@/lib/budget/commands";
import { buildMobileBudgets } from "@/lib/mobile/reads";
import { mobileCommandError, mobileError, mobileJson, mobileRoute } from "@/lib/mobile/route";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const GET = mobileRoute(async ({ user, supabase }, request) => {
  const month = new URL(request.url).searchParams.get("month") ?? monthKey(new Date());
  if (!MONTH.test(month)) return mobileError("invalid_month", 422);

  const dash = await loadMonthlyDashboard(supabase, user.id, month, plaidUiEnabled());
  // Never serve partial money numbers: a failed side query would silently misstate what is left to spend.
  if (dash.degraded.length > 0) return mobileError("unavailable", 503);
  return mobileJson(buildMobileBudgets({ month, dash }));
});

export const PUT = mobileRoute(async ({ user, supabase }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileError("invalid_body", 400);
  }

  const result = await setBudget(supabase, user.id, body);
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

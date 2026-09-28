/**
 * GET /api/mobile/budgets?month=YYYY-MM — budget vs actual per expense category, from the same reads and money math as
 * Home (`loadHome`); the month defaults to the user's current month in their own time zone. Never partial numbers (a
 * failed side query answers 503).
 * PUT /api/mobile/budgets — `{ categoryId, month, amount:"400" }`: set one category's month; an empty or zero amount clears it.
 *
 * Adapters over `src/lib/home/load-home.ts`, `src/lib/mobile/reads.ts` and `src/lib/budgets/commands.ts` (shared with the
 * web Server Action).
 */
import { setBudget } from "@/lib/budgets/commands";
import { loadHome } from "@/lib/home/load-home";
import { buildMobileBudgets } from "@/lib/mobile/reads";
import { mobileCommandError, mobileError, mobileJson, mobileRoute, readJson } from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const GET = mobileRoute(async ({ user, supabase }, request) => {
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  if (month !== undefined && !MONTH.test(month)) return mobileError("invalid_month", 422);

  const timeZone = await profileTimeZone(supabase, user.id);
  if (!timeZone) return mobileError("not_onboarded", 409);

  const home = await loadHome(supabase, { userId: user.id, timeZone, month, plaidEnabled: plaidUiEnabled() });
  // Never serve partial money numbers: a failed side query would silently misstate what is left to spend.
  if (home.degraded.length > 0) return mobileError("unavailable", 503);
  return mobileJson(buildMobileBudgets(home));
});

export const PUT = mobileRoute(async ({ user, supabase }, request) => {
  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return mobileError("invalid_body", 400);

  const result = await setBudget(supabase, user.id, body);
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

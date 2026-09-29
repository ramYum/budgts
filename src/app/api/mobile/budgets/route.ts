/**
 * GET /api/mobile/budgets?month=YYYY-MM&range=month|all — the Budgets screen: budget vs actual per expense category with
 * last month's actuals, the hero's progress and the unplanned-spending note (`range=month`, the default), or every expense
 * category's all-time spending (`range=all`). `loadBudgets` is the very read and money math the web Budgets page renders;
 * the month defaults to the user's current month in their own time zone. Never partial numbers (a failed side query
 * answers 503).
 * PUT /api/mobile/budgets — `{ categoryId, month, amount:"400" }`: set one category's month; an empty or zero amount clears it.
 *
 * Adapters over `src/lib/budgets/load-budgets.ts`, `src/lib/mobile/reads.ts` and `src/lib/budgets/commands.ts` (shared with
 * the web page and Server Action).
 */
import { setBudget } from "@/lib/budgets/commands";
import { loadBudgets } from "@/lib/budgets/load-budgets";
import { buildMobileBudgets, buildMobileBudgetsAllTime } from "@/lib/mobile/reads";
import { MONTH_RE, mobileCommandError, mobileError, mobileJson, mobileRoute, readJson } from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ user, supabase }, request) => {
  const params = new URL(request.url).searchParams;
  const month = params.get("month") ?? undefined;
  if (month !== undefined && !MONTH_RE.test(month)) return mobileError("invalid_month", 422);
  const range = params.get("range") ?? "month";
  if (range !== "month" && range !== "all") return mobileError("invalid_range", 422);

  const timeZone = await profileTimeZone(supabase, user.id);
  if (!timeZone) return mobileError("not_onboarded", 409);

  const data = await loadBudgets(supabase, { userId: user.id, timeZone, month, range, plaidEnabled: plaidUiEnabled() });
  // Never serve partial money numbers: a failed side query would silently misstate what is left to spend.
  if (data.degraded.length > 0) return mobileError("unavailable", 503);
  return mobileJson(data.range === "all" ? buildMobileBudgetsAllTime(data) : buildMobileBudgets(data));
});

export const PUT = mobileRoute(async ({ user, supabase }, request) => {
  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return mobileError("invalid_body", 400);

  const result = await setBudget(supabase, user.id, body);
  return result.ok ? mobileJson({ ok: true }) : mobileCommandError(result);
});

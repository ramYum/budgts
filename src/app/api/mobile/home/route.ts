/**
 * GET /api/mobile/home — the native Home screen's data: the same authoritative
 * dashboard math the web Home uses (`loadMonthlyDashboard` → `buildDashboard`,
 * `goalsSummary`), projected into a small explicit view-model
 * (`src/lib/mobile/home.ts`) instead of raw rows.
 *
 * Security model:
 * - Bearer token mandatory. Cookies are ignored (see `getBearerContext`).
 * - Identity is the token's verified user; the request has NO parameters that
 *   choose a user or a month, and none are read.
 * - Data is read through a Supabase client carrying the caller's own JWT, so
 *   Row-Level Security scopes every query to that user. Nothing here uses the
 *   secret key or bypasses RLS.
 * - Failures are generic (`unauthorized` / `home_unavailable`); nothing about
 *   the caller's data is logged or echoed.
 *
 * Design authority: docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6/§7.
 */
import { NextResponse } from "next/server";
import { getBearerContext } from "@/lib/auth/bearer-context";
import { monthKey } from "@/lib/budget/month";
import { loadMonthlyDashboard, loadRecentActivity } from "@/lib/budget/home-data";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { buildMobileHome } from "@/lib/mobile/home";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const ctx = await getBearerContext(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  try {
    const plaidOn = plaidUiEnabled();
    const month = monthKey(new Date());

    const [dash, recent] = await Promise.all([
      loadMonthlyDashboard(ctx.supabase, ctx.user.id, month, plaidOn),
      loadRecentActivity(ctx.supabase, plaidOn),
    ]);

    // Never serve partial money numbers: a failed side query would otherwise
    // silently produce a wrong Money Left / empty budgets.
    if (dash.degraded.length > 0 || recent.failed) {
      return NextResponse.json({ error: "home_unavailable" }, { status: 503, headers: NO_STORE });
    }

    return NextResponse.json(buildMobileHome({ month, dash, recent: recent.items }), {
      headers: NO_STORE,
    });
  } catch {
    // Deliberately no logging of the error or any data.
    return NextResponse.json({ error: "home_unavailable" }, { status: 503, headers: NO_STORE });
  }
}

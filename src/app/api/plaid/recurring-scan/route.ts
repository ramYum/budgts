/**
 * POST /api/plaid/recurring-scan — the daily recurring-detection job.
 * Invoked by a Supabase pg_cron schedule (via pg_net), same auth posture as
 * /api/plaid/sync-due. Iterates every user with at least one Plaid-connected
 * account and runs one recurring-detection pass each, bounded by that
 * user's `recurring_last_scan_at` watermark. Design:
 * docs/specs/2026-09-16-recurring-detection-design.md §G.
 *
 * Deliberately separate from sync-due's ~30s-cadence poller: recurring
 * predictions have no sub-minute freshness need, so running this once a day
 * avoids adding load to the tighter per-item sync loop.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { runRecurringDetectionForUser } from "@/lib/plaid/recurring-engine";
import { createRecurringStore, findUsersWithPlaidAccounts, loadRecurringWatermark } from "@/lib/plaid/recurring-store";
import { plaidDb } from "@/server/plaid/service";

function authorized(request: Request): boolean {
  const secret = loadPlaidConfig().cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = createRecurringStore(plaidDb);
  const userIds = await findUsersWithPlaidAccounts(plaidDb);

  // Serial on purpose, same reasoning as sync-due: bounded work at the
  // current user scale, and it keeps the daily job simple to reason about.
  const results = [];
  for (const userId of userIds) {
    const watermark = await loadRecurringWatermark(plaidDb, userId);
    try {
      const outcome = await runRecurringDetectionForUser({ userId, watermark, store });
      results.push({ userId, ok: true, ...outcome });
    } catch (e) {
      console.error("[plaid] recurring-scan failed for user", { userId, e });
      results.push({ userId, ok: false });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}

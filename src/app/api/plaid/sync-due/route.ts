/**
 * POST /api/plaid/sync-due — the poller. Invoked by Supabase pg_cron (via
 * pg_net) with `Authorization: Bearer <CRON_SECRET>`. Syncs items that are
 * flagged `needs_sync` or stale; `?full=1` sweeps every active item. Design §20.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { findItemsToSync } from "@/lib/plaid/item-store";
import { plaidDb, syncItem } from "@/server/plaid/service";

const STALE_MS = 6 * 60 * 60 * 1000; // 6h backstop

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

  const full = new URL(request.url).searchParams.get("full") === "1";
  const items = await findItemsToSync(plaidDb, {
    staleBefore: full ? new Date() : new Date(Date.now() - STALE_MS),
    onlyActive: true,
  });

  // Serial on purpose — bounded work, and it keeps us clear of Plaid rate limits.
  const results = [];
  for (const item of items) {
    results.push(await syncItem(item));
  }

  return NextResponse.json({ ran: results.length, results });
}

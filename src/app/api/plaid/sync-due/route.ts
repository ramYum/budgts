/**
 * POST /api/plaid/sync-due — the reconciliation sweep. Webhooks drive syncing
 * (/api/plaid/webhook claims and syncs the Item right after its 200); this
 * sweep, run every 10 minutes by Supabase pg_cron (via pg_net) with
 * `Authorization: Bearer <CRON_SECRET>`, only catches what that path left
 * behind: failed syncs (needs_sync stays set — this interval is the retry
 * backoff), runs killed mid-way (lease expired), and Items silent for 6h
 * (a webhook lost beyond Plaid's 24h retry window). `?full=1` sweeps every
 * active Item. Each Item goes through the same lease as every other trigger,
 * so overlapping invocations never sync one Item twice. Design §20.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { findSyncCandidates } from "@/lib/plaid/item-store";
import { sweepItems } from "@/lib/plaid/sync-runner";
import { plaidDb, SYNC_BUDGET_MS, syncRunner } from "@/server/plaid/service";

// Serial per Item, bounded by SYNC_BUDGET_MS; this is the platform ceiling.
export const maxDuration = 300;

const STALE_MS = 6 * 60 * 60 * 1000; // 6h backstop for lost webhooks

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
  const staleBefore = full ? new Date() : new Date(Date.now() - STALE_MS);
  const deps = syncRunner();
  const deadline = deps.now() + SYNC_BUDGET_MS;

  const candidates = await findSyncCandidates(plaidDb, staleBefore);
  const results = await sweepItems(deps, candidates, staleBefore, deadline);

  return NextResponse.json({ candidates: candidates.length, ran: results.length, results });
}

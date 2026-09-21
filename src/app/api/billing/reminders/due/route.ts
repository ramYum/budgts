/**
 * POST /api/billing/reminders/due — the scheduled trial-end reminder sweep. Invoked by Supabase pg_cron (via pg_net)
 * with `Authorization: Bearer <CRON_SECRET>`, like the Plaid poller. No delivery channel exists yet, so it currently
 * REPORTS what is due without claiming anything; wiring a channel is an owner decision (see the monetization design).
 */
import { loadBillingConfig } from "@/lib/billing/config";
import { getServerDb } from "@/lib/billing/db";
import { handleReminderCron } from "@/lib/billing/http";
import { createReminderDelivery } from "@/lib/billing/wiring";

export async function POST(request: Request) {
  const db = await getServerDb();
  const config = loadBillingConfig();
  return handleReminderCron(request, { db, config, reminderDelivery: createReminderDelivery(db, config) });
}

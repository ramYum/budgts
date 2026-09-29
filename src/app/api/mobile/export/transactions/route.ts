/**
 * GET /api/mobile/export/transactions — Settings → Export transactions: the caller's full transaction history as CSV
 * (`transactionsCsv`, the same file the web download builds), dated with the user's own today. The app hands it to the
 * system share sheet. Bearer only; RLS scopes the read to the caller. A failed read answers a generic 503 (never a
 * truncated backup, never the storage error's text).
 */
import { todayDateKey } from "@/lib/budget/month";
import { csvDownloadHeaders, transactionsCsv } from "@/lib/export/transactions-csv";
import { mobileError, mobileRoute } from "@/lib/mobile/route";
import { profileTimeZone } from "@/lib/mobile/time-zone";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const GET = mobileRoute(async ({ user, supabase }) => {
  const [timeZone, csv] = await Promise.all([profileTimeZone(supabase, user.id), transactionsCsv(supabase, plaidUiEnabled())]);
  if (!timeZone) return mobileError("not_onboarded", 409);
  return new Response(csv, { headers: csvDownloadHeaders(todayDateKey(timeZone)) });
});

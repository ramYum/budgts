import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { requireTimeZone } from "@/lib/current-profile";
import { todayDateKey } from "@/lib/budget/month";
import { csvDownloadHeaders, transactionsCsv } from "@/lib/export/transactions-csv";
import { describePlaidError } from "@/lib/plaid/error-policy";

/** Full CSV of the signed-in user's transactions — a plain-text backup. The CSV itself is built by `transactionsCsv`,
 * shared with the native app's GET /api/mobile/export/transactions. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let csv: string;
  try {
    csv = await transactionsCsv(await createClient(), plaidUiEnabled());
  } catch (e) {
    // Never the storage error's text: it can carry SQL. The log gets codes only.
    console.error("export failed", describePlaidError(e));
    return new Response("The export failed. Try again in a moment.", { status: 500 });
  }

  // The user's own today, so a late-evening export isn't dated tomorrow.
  const today = todayDateKey(await requireTimeZone(user.id));
  return new Response(csv, { headers: csvDownloadHeaders(today) });
}

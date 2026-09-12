import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

function summarizeNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} other account${names.length - 1 === 1 ? "" : "s"}`;
}

/**
 * Owner-facing warning for an anomaly-flagged connection (design: 2026-09-12
 * duplicate-feed investigation). Rendered once in the dashboard layout so it
 * reaches every financial surface (Dashboard, Transactions, Budgets, Goals) —
 * a flagged account's numbers must never look like an ordinary total.
 *
 * Self-gates like `BankConnections`: inert until migration 0004+0006 have run
 * and the flag is off. No dismiss control — clearing the flag is a deliberate
 * owner action in Settings, never something a stray tap on the banner can do.
 */
export async function ReviewBanner() {
  if (!plaidUiEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();

  const { data, error } = await supabase.from("plaid_accounts").select("name").eq("needs_review", true);
  if (error || !data || data.length === 0) return null;

  const summary = summarizeNames(data.map((a) => a.name ?? "an account"));

  return (
    <div className="mx-4 mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
      <p>
        <span className="font-medium">Totals may be inaccurate.</span> {summary} showed unusually repetitive
        transaction data from your bank. Nothing has been removed or changed —{" "}
        <a href="/settings" className="underline underline-offset-2">
          review it in Settings
        </a>
        .
      </p>
    </div>
  );
}

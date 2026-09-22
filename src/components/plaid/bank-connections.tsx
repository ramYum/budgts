import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { loadConnectedBanksData } from "@/lib/plaid/connected-banks-read";
import { ConnectBank } from "./connect-bank";
import { ConnectedBanks } from "./connected-banks";

/**
 * "Connected banks" section for `/settings` (design §8, §23, §24). Self-gates on `plaidUiEnabled()`; the data load
 * (including "tables not present on this deployment" -> an empty list) is shared with the native
 * `GET /api/mobile/plaid/banks` route — see `loadConnectedBanksData` (mobile-only-transition spec §4A). On a real
 * deployment that distinction is moot: every environment with Plaid on has migration 0004+ applied.
 */
export async function BankConnections() {
  if (!plaidUiEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();

  const banks = await loadConnectedBanksData(supabase);
  const { data: budgtsAcctData } = await supabase.from("accounts").select("id, name").eq("is_archived", false).order("name");
  const budgtsAccounts = (budgtsAcctData ?? []) as { id: string; name: string }[];

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
        Connected banks
      </h2>

      {banks.length === 0 ? (
        <div className="card space-y-3 rounded-2xl border border-hairline p-4">
          <p className="text-sm text-muted">
            Connect a bank and Budgts imports its transactions for you — categories filled in, ready to
            check. Manual entry still works for cash and anything your bank can&apos;t reach.
          </p>
          <p className="text-xs text-muted">
            Your data is secure. Budgts can only read your account and transaction data to help you budget —
            it cannot send money, make payments, make purchases, or transfer funds.
          </p>
          <ConnectBank accounts={budgtsAccounts} />
        </div>
      ) : (
        <>
          <ConnectedBanks banks={banks} budgtsAccounts={budgtsAccounts} />
          <ConnectBank accounts={budgtsAccounts} tone="outline" label="Connect another bank" />
        </>
      )}
    </section>
  );
}

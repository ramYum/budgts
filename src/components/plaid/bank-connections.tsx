import { createClient, getSessionUser } from "@/lib/supabase/server";
import { loadConnectedBanks } from "@/lib/plaid/connected-banks-read";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { ConnectBank } from "./connect-bank";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";
import { IconTile } from "@/components/ui";
import { ConnectedBanks } from "./connected-banks";
import { LapseRemovalNotice } from "./lapse-removal-notice";
import { loadDetachedHeld } from "@/lib/plaid/detached-held-read";
import { RemovedBanksHeld } from "./removed-banks-held";

/**
 * "Connected banks" section for `/settings` (design §8, §23, §24). Self-gates
 * on `plaidUiEnabled()` and on the Plaid tables existing, so it is inert on any
 * deployment that has not run migration 0004.
 */
export async function BankConnections() {
  if (!plaidUiEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;
  // The reads live in loadConnectedBanks, shared with the native API.
  const supabase = await createClient();
  const [data, detached] = await Promise.all([loadConnectedBanks(supabase), loadDetachedHeld(supabase)]);
  if (!data) return null; // tables not present on this deployment
  const { banks, budgtsAccounts, connectionsRemovedForLapse } = data;

  return (
    <>
      <PageHeader title="Connected banks" back="/more" backOnDesktop={false} />
      <div className="space-y-6 md:max-w-[720px]">
        {connectionsRemovedForLapse ? <LapseRemovalNotice /> : null}
        {/* Held rows a disconnected bank left behind: their only exit (card payments §5c). */}
        <RemovedBanksHeld groups={detached.groups} answered={detached.answered} />
        {banks.length === 0 ? (
          <div className="px-card-raised flex flex-col items-start gap-4 p-2 md:p-6" data-testid="connected-banks-empty">
            <IconTile name="bank" />
            <p className="text-[15px] leading-6 text-ink">
              Connect a bank and Budgts imports its transactions for you, categories filled in, ready to check.
              Manual entry still works for cash and anything your bank can&apos;t reach.
            </p>
            <p className="flex items-start gap-2 text-sm leading-5 text-muted">
              <Icon name="shield" className="-my-0.5 text-graphite" />
              Your data is secure. Budgts can only read your account and transaction data to help you budget. It
              can&apos;t send money, make payments, make purchases, or transfer funds.
            </p>
          </div>
        ) : (
          <ConnectedBanks banks={banks} budgtsAccounts={budgtsAccounts} />
        )}
        {/* One ConnectBank at a fixed position in both states: saving the first
            bank's mapping re-renders this page (server-action revalidation), and
            a remount here would drop the mapping overlay before it can show a
            "first sync didn't finish" warning. A phone shows it full width
            under the cards; desktop lifts it into the header's action slot. */}
        <div className="md:absolute md:right-[104px] md:top-[42px]">
          <ConnectBank
            accounts={budgtsAccounts}
            label={banks.length === 0 ? "Connect a bank" : "Connect another bank"}
            fullWidth
            buttonClassName="md:w-auto"
          />
        </div>
      </div>
    </>
  );
}

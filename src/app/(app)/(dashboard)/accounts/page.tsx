import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { requireTimeZone } from "@/lib/current-profile";
import { loadAccountsOverview } from "@/lib/accounts/load-accounts-overview";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { PageHeader } from "@/components/page-header";
import { AccountManager, AddAccountButton } from "@/components/account-manager";

export const metadata: Metadata = { title: "Accounts" };

/** "What money do I currently have?" (design spec §31). Accounts grouped the
 * way they arrive: under the bank that links them, then the ones kept by
 * hand, then archived. Each shows how many transactions it holds this month
 * (the rows the Activity list shows for it). The reads and the grouping live
 * in loadAccountsOverview, shared with the native app's
 * GET /api/mobile/accounts/overview. */
export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const timeZone = await requireTimeZone(user.id);
  const { groups, archived } = await loadAccountsOverview(await createClient(), {
    timeZone,
    plaidEnabled: plaidUiEnabled(),
  });

  return (
    <>
      <PageHeader title="Accounts" back="/more" backOnDesktop={false} action={<AddAccountButton />} />
      <div className="space-y-6 md:max-w-[720px]">
        <p className="max-w-xl text-[15px] leading-6 text-muted">
          Accounts hold your transactions. Linked ones update on their own; add cash or anything else by hand.
        </p>
        <AccountManager groups={groups} archived={archived} />
      </div>
    </>
  );
}

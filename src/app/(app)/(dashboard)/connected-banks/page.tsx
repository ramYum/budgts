import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { BankConnections } from "@/components/plaid/bank-connections";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const metadata: Metadata = { title: "Connected banks" };

/** Trustworthy, transparent bank-connection management (design spec §33-35).
 * `BankConnections` is the existing, self-contained component (fetches its
 * own data, gated on `plaidUiEnabled()`); this route only gives it a home of
 * its own instead of living inside Settings. */
export default function ConnectedBanksPage() {
  return (
    plaidUiEnabled() ? (
      <BankConnections />
    ) : (
      <>
        <PageHeader title="Connected banks" back="/more" backOnDesktop={false} />
        <p className="text-[15px] leading-6 text-muted md:max-w-[720px]">
          Bank connections aren&apos;t available yet on this deployment. Manual entry works for every account in
          the meantime: add transactions from Activity.
        </p>
      </>
    )
  );
}

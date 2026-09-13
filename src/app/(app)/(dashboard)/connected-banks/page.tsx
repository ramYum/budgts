import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { BankConnections } from "@/components/plaid/bank-connections";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

export const metadata: Metadata = { title: "Connected Banks" };

/** Trustworthy, transparent bank-connection management (design spec §33-35).
 * `BankConnections` is the existing, self-contained component (fetches its
 * own data, gated on `plaidUiEnabled()`); this route only gives it a home of
 * its own instead of living inside Settings. */
export default function ConnectedBanksPage() {
  return (
    <div className="pt-1">
      <PageHeader title="Connected Banks" back="/more" />
      {plaidUiEnabled() ? (
        <BankConnections />
      ) : (
        <p className="text-sm text-muted">
          Bank connections aren&apos;t available yet on this deployment. Manual entry works for every
          account in the meantime — add transactions from Activity.
        </p>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Security" };

/** Plain-language security reassurance (design spec §41) — no claim here that
 * isn't already true of the app's actual architecture (RLS-scoped Postgres
 * access via the user's own session; bank credentials handled by Plaid Link,
 * never seen by Budgt). */
export default function SecurityPage() {
  return (
    <div className="space-y-4 pt-1">
      <PageHeader title="Security" back="/settings" />
      <div className="card space-y-3 rounded-2xl border border-hairline p-4">
        <p className="text-sm font-semibold text-heading">Your financial connections are protected.</p>
        <p className="text-sm text-muted">
          Your bank credentials never reach Budgt — bank connections go through Plaid, which hands
          Budgt a secure token, not your username or password.
        </p>
        <p className="text-sm text-muted">
          Every piece of your data is scoped to your account at the database level, so it&apos;s never
          visible to anyone else, even in theory.
        </p>
        <p className="text-sm text-muted">
          Budgt can read your account and transaction data to help you budget. It cannot send money,
          make payments, make purchases, or transfer funds.
        </p>
      </div>
    </div>
  );
}

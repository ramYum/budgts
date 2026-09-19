import Link from "next/link";
import { DashboardView } from "@/components/dashboard-view";
import { NeedsCategory } from "@/components/plaid/needs-category";
import { ConnectedBanks } from "@/components/plaid/connected-banks";
import { ConnectBank } from "@/components/plaid/connect-bank";
import { PrimaryLinkButton } from "@/components/ui";
import { buildDemoBanks, buildDemoDashboard, buildDemoNeedsCategory } from "@/lib/tour/demo-data";
import type { TourTopicId } from "@/lib/tour/topics";
import { DemoFrame } from "./demo-frame";

const DEMO_ACCOUNTS = [{ id: "demo-acct-checking", name: "Everyday Checking" }];

/**
 * The "show, don't tell" half of each walkthrough step: the REAL Budgts
 * component for that concept, fed controlled demo data inside a non-interactive
 * `DemoFrame` — so an explanation can never read or change the user's real
 * financial data, and can never drift from the product it explains.
 *
 * The bank-connection step is the one deliberate exception: it renders the
 * real, live `ConnectBank`, because its call to action must enter the real flow.
 */
export function TopicDemo({
  topic,
  accounts,
  plaidEnabled,
  now = new Date(),
}: {
  topic: TourTopicId;
  /** The user's real Budgts accounts — only the live connect step uses these. */
  accounts: { id: string; name: string }[];
  plaidEnabled: boolean;
  now?: Date;
}) {
  switch (topic) {
    case "organize":
      return (
        <DemoFrame label="Your Home screen" highlight="activity">
          <DashboardView {...buildDemoDashboard(now)} />
        </DemoFrame>
      );

    case "money-left":
      return (
        <DemoFrame label="Money Left on Home" highlight="money-left" clip>
          <DashboardView {...buildDemoDashboard(now)} />
        </DemoFrame>
      );

    case "categorization": {
      const demo = buildDemoNeedsCategory(now);
      return (
        <DemoFrame label="Budgts asks once, per merchant">
          <NeedsCategory
            items={demo.items}
            categories={demo.categories}
            missingStandard={demo.missingStandard}
            currency={demo.currency}
          />
        </DemoFrame>
      );
    }

    case "disconnect": {
      const { healthy } = buildDemoBanks(now);
      return (
        <DemoFrame label="Connected banks" highlight="disconnect">
          <ConnectedBanks banks={[healthy]} budgtsAccounts={DEMO_ACCOUNTS} />
        </DemoFrame>
      );
    }

    case "excluded-account": {
      const { flagged, excluded } = buildDemoBanks(now);
      return (
        <div className="space-y-5">
          <DemoFrame label="1 · Budgts flags an account for your review" highlight="exclude">
            <ConnectedBanks banks={[flagged]} budgtsAccounts={DEMO_ACCOUNTS} />
          </DemoFrame>
          <DemoFrame label="2 · Only if you choose Exclude, it stops counting" highlight="review-notice">
            <ConnectedBanks banks={[excluded]} budgtsAccounts={DEMO_ACCOUNTS} />
          </DemoFrame>
        </div>
      );
    }

    case "connect-bank":
      return plaidEnabled ? (
        <div className="card space-y-3 rounded-2xl border border-hairline p-4">
          <p className="text-sm font-semibold text-heading">Ready when you are</p>
          <p className="text-sm text-muted">
            This opens the real, secure bank window — not a demo. You can also do it later from
            Connected banks.
          </p>
          <ConnectBank accounts={accounts} />
          <Link href="/connected-banks" className="block text-xs font-medium text-accent hover:underline">
            Go to Connected banks
          </Link>
        </div>
      ) : (
        <div className="card space-y-3 rounded-2xl border border-hairline p-4">
          <p className="text-sm font-semibold text-heading">Bank connection isn&apos;t available here yet</p>
          <p className="text-sm text-muted">
            You can still track everything by hand — add an account and enter transactions yourself.
          </p>
          <PrimaryLinkButton href="/accounts">Add an account</PrimaryLinkButton>
        </div>
      );
  }
}

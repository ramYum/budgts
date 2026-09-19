import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PrimaryLinkButton } from "@/components/ui";
import { TOUR_TOPICS } from "@/lib/tour/topics";

export const metadata: Metadata = { title: "How Budgts Works" };

/**
 * Home of the "How Budgts Works" walkthrough inside the app: start it from the
 * top, or open any single explanation. The walkthrough itself lives at
 * `/tour/<topic>` (outside the dashboard layout — see that route for why) and
 * shows the real Budgts screens with controlled demo data.
 */
export default function HowItWorksPage() {
  return (
    <div className="space-y-6 pt-1">
      <PageHeader title="How Budgts Works" back="/help" />

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-heading">You spend. Budgts keeps track.</h2>
        <p className="text-sm text-muted">
          Six short explanations, each shown on the real screens with example data — nothing here
          touches your accounts.
        </p>
      </div>

      <PrimaryLinkButton href="/tour/organize" arrow>
        Start the walkthrough
      </PrimaryLinkButton>

      <ol className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        {TOUR_TOPICS.map((t, i) => (
          <li key={t.id}>
            <Link href={`/tour/${t.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-accent">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-heading">{t.question}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

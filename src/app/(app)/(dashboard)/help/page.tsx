import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TOUR_TOPICS } from "@/lib/tour/topics";

export const metadata: Metadata = { title: "Help" };

/** Static help content — no backend needed (design spec §43). The FAQ renders
 * from the same `TOUR_TOPICS` as the "How Budgts Works" walkthrough, so the two
 * can never say different things; each answer links to its walkthrough step. */
export default function HelpPage() {
  return (
    <div className="space-y-6 pt-1">
      <PageHeader title="Help" back="/more" />
      <Link
        href="/help/how-it-works"
        className="card block space-y-1 rounded-2xl border border-hairline p-4"
      >
        <p className="text-sm font-semibold text-accent">How Budgts Works →</p>
        <p className="text-sm text-muted">
          A short walkthrough using Budgts&apos; real screens: what Money Left means, how
          categorizing works, what disconnecting a bank does, and how to connect one.
        </p>
      </Link>
      <Link
        href="/tour"
        className="card block rounded-2xl border border-hairline p-4 text-sm font-semibold text-accent"
      >
        Replay the tour →
      </Link>
      <ul className="space-y-4">
        {TOUR_TOPICS.map((t) => (
          <li key={t.id} className="card space-y-1.5 rounded-2xl border border-hairline p-4">
            <p className="text-sm font-semibold text-heading">{t.question}</p>
            <p className="text-sm text-muted">{t.answer}</p>
            <Link
              href={`/tour/${t.id}`}
              aria-label={`See it in the walkthrough: ${t.question}`}
              className="inline-block text-xs font-medium text-accent hover:underline"
            >
              See it →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

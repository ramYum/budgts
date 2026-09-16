import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Help" };

const FAQ: { q: string; a: string }[] = [
  {
    q: "How does Budgts organize my money?",
    a: "Connect a bank and Budgts imports and categorizes transactions automatically. You can also add anything by hand — cash, or accounts your bank can't reach.",
  },
  {
    q: "What is Money Left?",
    a: "Money Left is what's left after spending is subtracted from income for the month. It doesn't measure a savings-account balance — it's a snapshot of the month's flow.",
  },
  {
    q: "How does categorization work?",
    a: "Budgts files obvious transactions automatically. When it isn't confident, it asks once — your answer is remembered for that merchant next time.",
  },
  {
    q: "What happens if I disconnect a bank?",
    a: "Disconnecting stops new transactions from syncing. Everything already imported stays in your history and keeps counting toward budgets, unless you explicitly choose to delete it.",
  },
  {
    q: "Why is an account excluded from my totals?",
    a: "Only you can exclude an account, and only after Budgts flags it for review — usually because its feed looked unreliable (e.g. duplicated activity). Exclusion never happens automatically.",
  },
];

/** Static help content — no backend needed (design spec §43). */
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
          The short version: you spend, Budgts keeps track. See the whole workflow in one page.
        </p>
      </Link>
      <Link
        href="/tour"
        className="card block rounded-2xl border border-hairline p-4 text-sm font-semibold text-accent"
      >
        Replay the tour →
      </Link>
      <ul className="space-y-4">
        {FAQ.map((item) => (
          <li key={item.q} className="card space-y-1.5 rounded-2xl border border-hairline p-4">
            <p className="text-sm font-semibold text-heading">{item.q}</p>
            <p className="text-sm text-muted">{item.a}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

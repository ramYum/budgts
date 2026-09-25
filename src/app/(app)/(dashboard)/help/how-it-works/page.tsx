import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NavIcon, type NavGlyph } from "@/components/nav-icons";
import { PrimaryLinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "How Budgts Works" };

const STEPS: { glyph: NavGlyph; heading: string; body: string }[] = [
  {
    glyph: "connected-banks",
    heading: "Connect your accounts",
    body: "Connect your bank and card accounts once. Budgts automatically brings in your transactions, so you don't have to enter every purchase yourself.",
  },
  {
    glyph: "activity",
    heading: "Transactions arrive automatically",
    body: "Once you're connected, new purchases show up on their own — taps, swipes, and online orders included. Manual entry is there for cash and anything your bank can't reach, not the everyday habit.",
  },
  {
    glyph: "categorize",
    heading: "Budgts sorts them for you",
    body: "Every purchase gets filed into the right category automatically. When Budgts isn't confident, it asks instead of guessing — and remembers your answer for that merchant next time.",
  },
  {
    glyph: "review",
    heading: "You review the exceptions",
    body: "Most purchases are handled automatically. When Budgts isn't sure, we'll ask — the needs-a-category bell shows you exactly what needs a look, and answering once takes care of it going forward.",
  },
  {
    glyph: "budgets",
    heading: "Set your budgets",
    body: "Tell Budgts how much you want to spend per category, once. From there, Budgts compares your actual spending against that plan automatically.",
  },
  {
    glyph: "money-left",
    heading: "See your Money Left",
    body: "Home shows Money Left — your income minus your spending so far this month. It's a snapshot of the month's flow, not your savings-account balance.",
  },
  {
    glyph: "insights",
    heading: "Track your progress",
    body: "As the months add up, Budgts turns your organized activity into a clear picture — spending trends, how much of your income you're keeping, and how your budgets are holding up.",
  },
];

/**
 * The permanent "how it works" explainer — the mental model behind Budgts'
 * core convenience pitch (connect → transactions arrive → auto-categorize →
 * review exceptions → set a budget → Money Left → track progress).
 * Complements, and deliberately doesn't duplicate, the hands-on first-run
 * welcome guide reachable from "Replay the welcome guide" on /help: this page teaches WHY/HOW
 * the workflow fits together; the tour shows WHERE the real controls are.
 * Purely static — no data — same terminology as the tour and the Help FAQ.
 * See docs/specs/2026-09-15-how-budgts-works-guide-design.md.
 */
export default function HowItWorksPage() {
  return (
    <div className="space-y-6 pt-1">
      <PageHeader title="How Budgts Works" back="/help" />

      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-heading">You spend. Budgts keeps track.</h2>
        <p className="text-sm text-muted">
          Connect your accounts, spend normally, and Budgts automatically keeps track of your
          transactions and organizes your spending — so you don&apos;t have to.
        </p>
      </div>

      <ol className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        {STEPS.map((s, i) => (
          <li key={s.heading} className="flex gap-3 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <NavIcon glyph={s.glyph} className="h-5 w-5" />
            </span>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted">Step {i + 1}</p>
              <p className="text-sm font-semibold text-heading">{s.heading}</p>
              <p className="text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="card space-y-3 rounded-2xl border border-hairline p-4 text-center">
        <p className="text-sm font-semibold text-heading">You spend. Budgts keeps track.</p>
        <p className="text-sm text-muted">Want Crystal to walk you through it? The welcome guide takes about a minute.</p>
        <PrimaryLinkButton href="/tour" className="mx-auto">
          Open the welcome guide
        </PrimaryLinkButton>
      </div>
    </div>
  );
}

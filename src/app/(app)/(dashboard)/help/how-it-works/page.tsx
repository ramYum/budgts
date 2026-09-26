import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Icon, type IconName } from "@/components/icon";
import { Mascot } from "@/components/mascot";
import { PrimaryLinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "How Budgts works" };

const STEPS: { icon: IconName; heading: string; body: string }[] = [
  {
    icon: "bank",
    heading: "Connect your accounts",
    body: "Connect your bank and card accounts once. Budgts brings in your transactions, so you don't enter every purchase yourself.",
  },
  {
    icon: "receipt",
    heading: "Transactions arrive automatically",
    body: "New purchases show up on their own — taps, swipes and online orders. Manual entry is there for cash and anything your bank can't reach.",
  },
  {
    icon: "tag",
    heading: "Budgts sorts them for you",
    body: "Every purchase is filed into the right category. When Budgts isn't sure it asks instead of guessing, and remembers your answer.",
  },
  {
    icon: "bell",
    heading: "You review the exceptions",
    body: "The bell shows exactly what needs a look. Answering once takes care of that merchant from then on.",
  },
  {
    icon: "budgets",
    heading: "Set your budgets",
    body: "Tell Budgts how much to spend per category, once. It compares your real spending against that plan.",
  },
  {
    icon: "coins",
    heading: "See your Money Left",
    body: "Home shows income minus spending so far this month — a snapshot of the month's flow, not your savings balance.",
  },
  {
    icon: "insights",
    heading: "Track your progress",
    body: "As months add up you see spending trends, how much income you keep and how budgets are holding.",
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
    <>
      <PageHeader title="How Budgts works" back="/help" />
      <div className="space-y-6 md:max-w-[720px]">
        <div className="space-y-2">
          <h2 className="px-figure text-balance text-ink">You spend. Budgts keeps track.</h2>
          <p className="text-[15px] leading-6 text-muted">
            Connect your accounts, spend normally, and Budgts organizes everything — so you don&apos;t have to.
          </p>
        </div>

        <ol className="px-card px-3 py-4 md:px-4 md:py-6">
          {STEPS.map((s, i) => (
            <li key={s.heading} className="relative flex gap-3 pb-6 last:pb-0 md:gap-4">
              {/* the dotted thread from one step to the next */}
              {i < STEPS.length - 1 ? (
                <span className="px-rule-v absolute bottom-0 left-[15px] top-10" aria-hidden />
              ) : null}
              <span className="px-tile-ink flex h-8 w-8 shrink-0 items-center justify-center">
                <span className="sr-only">Step {i + 1}</span>
                <span className="px-tag-bold tracking-normal text-white" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </span>
              <div className="min-w-0 space-y-1 pt-1">
                <p className="flex items-center gap-2 text-[15px] font-medium leading-6 text-ink">
                  <Icon name={s.icon} />
                  {s.heading}
                </p>
                <p className="text-sm leading-5 text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="px-card-ink flex flex-col items-start gap-4 p-3 sm:flex-row sm:items-center md:p-4">
          <Mascot mood="happy" size={80} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium leading-6 text-ink">Want Crystal to walk you through it?</p>
            <p className="text-[13px] leading-5 text-muted">The welcome guide takes about a minute.</p>
          </div>
          <PrimaryLinkButton href="/tour" arrow>
            Open the welcome guide
          </PrimaryLinkButton>
        </div>
      </div>
    </>
  );
}

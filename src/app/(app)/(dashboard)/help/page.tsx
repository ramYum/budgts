import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Robin } from "@/components/mascot";
import { PageHeader } from "@/components/page-header";
import { Chevron, IconTile, SectionHead } from "@/components/ui";

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
    <>
      <PageHeader title="Help" back="/more" />
      <div className="space-y-8 md:max-w-[720px]">
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <Link href="/help/how-it-works" className="px-card-ink press group flex items-center gap-4 p-3 md:p-4">
            <IconTile name="list" tone="accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-6 text-ink group-hover:underline">
                How Budgts works
              </span>
              <span className="block text-[13px] leading-5 text-muted">
                You spend, Budgts keeps track — the whole flow on one page.
              </span>
            </span>
            <Chevron />
          </Link>
          <Link href="/tour" className="px-card press group flex items-center gap-4 p-3 md:p-4">
            <span className="px-tile-wash flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>
              <Robin size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-6 text-ink group-hover:underline">
                Replay the welcome guide
              </span>
              <span className="block text-[13px] leading-5 text-muted">A one-minute tour with Crystal.</span>
            </span>
            <Chevron />
          </Link>
        </div>

        <section className="space-y-3">
          <SectionHead title="Common questions" />
          <div className="px-card px-rows px-3 py-1 md:px-4">
            {FAQ.map((item, i) => (
              <details key={item.q} className="group py-3" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1 text-[15px] font-medium leading-6 text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Icon name="plus" className="group-open:hidden" />
                  <Icon name="minus" className="hidden group-open:block" />
                </summary>
                <p className="pb-1 pt-2 text-[15px] leading-6 text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

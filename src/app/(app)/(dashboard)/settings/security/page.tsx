import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { IconTile } from "@/components/ui";

export const metadata: Metadata = { title: "Security" };

/** Plain-language security reassurance (design spec §41) — no claim here that
 * isn't already true of the app's actual architecture (RLS-scoped Postgres
 * access via the user's own session; bank credentials handled by Plaid Link,
 * never seen by Budgts). */
const FACTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "key",
    title: "Your bank login never reaches Budgts",
    body: "Plaid hands Budgts a secure token — never your username or password.",
  },
  {
    icon: "security",
    title: "Only you can see your data",
    body: "Every record is scoped to your account at the database level, so no one else can see it.",
  },
  {
    icon: "eye",
    title: "Read-only access",
    body: "Budgts can read accounts and transactions to help you budget. It can't send money, pay or transfer.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <PageHeader title="Security" back="/settings" />
      <div className="space-y-6 md:max-w-[720px]">
        <section className="px-card-ink flex items-center gap-4 p-3 md:p-4">
          <span className="px-tile-growth flex h-14 w-14 shrink-0 items-center justify-center text-pos" aria-hidden>
            <Icon name="shield" />
          </span>
          <div className="min-w-0">
            <h2 className="px-figure text-ink">Your connections are protected.</h2>
            <p className="text-[15px] leading-6 text-muted">Here&apos;s what that means in practice.</p>
          </div>
        </section>

        <ul className="px-card px-rows p-3 md:p-4">
          {FACTS.map((f) => (
            <li key={f.title} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 md:gap-4">
              <IconTile name={f.icon} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-6 text-ink">{f.title}</p>
                <p className="text-[15px] leading-6 text-muted">{f.body}</p>
              </div>
              <span className="px-check flex h-6 w-6 shrink-0 items-center justify-center text-white" data-state="done">
                <Icon name="check" size={12} />
                <span className="sr-only">True</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted">
          <Icon name="bank" size={12} />
          Bank connections by Plaid ·
          <Link href="/help/how-it-works" className="font-medium text-ink hover:underline">
            How Budgts works
          </Link>
        </p>
      </div>
    </>
  );
}

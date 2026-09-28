import type { Metadata } from "next";
import Link from "next/link";
import { ExternalRow, P, textLink } from "@/components/legal/legal-doc";
import { Icon } from "@/components/icon";
import { IconTile, SectionHead, buttonClass } from "@/components/ui";
import { APPLE_MANAGE_URL, GOOGLE_MANAGE_URL } from "@/lib/billing/manage";
import { billingLive } from "@/lib/billing/config";
import { lastUpdatedLine, requireLegalFacts } from "../require-facts";

export const metadata: Metadata = { title: "Support" };

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "A bank isn't syncing",
    a: (
      <>
        Open Connected banks in Budgts to see each bank&apos;s status. A bank that needs you shows a Reconnect button: sign in
        to it again and syncing picks up where it stopped.
      </>
    ),
  },
  {
    q: "A transaction is in the wrong category",
    a: (
      <>
        Open it in Activity and choose the right category. When Budgts asks you to sort a purchase from the bell, it remembers
        your answer for that merchant.
      </>
    ),
  },
  {
    q: "Delete my account",
    a: (
      <>
        In the app or on budgts.com: Settings, then Delete account. Or start from the{" "}
        <Link href="/account-deletion" className={textLink}>
          account deletion page
        </Link>
        .
      </>
    ),
  },
];

/**
 * The support page (the stores' "support URL"): one way to reach a person, the answers people look for first, and the
 * stores' own subscription pages. The contact address and publisher come from src/lib/legal/config.ts; without them this
 * page is a 404.
 */
export default function SupportPage() {
  const f = requireLegalFacts();

  return (
    <div className="space-y-6 md:max-w-[720px] md:space-y-8">
      <header className="space-y-2">
        <h1 className="px-title text-ink">Support</h1>
        <p className="text-[13px] leading-5 text-muted">{lastUpdatedLine(f)}</p>
        <P>Stuck on something? Here&apos;s how to get help.</P>
      </header>

      <section className="px-card-raised flex flex-col gap-4 p-2 sm:flex-row sm:items-center md:p-4" aria-labelledby="contact">
        <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconTile name="mail" />
        <div className="min-w-0 flex-1">
          <h2 id="contact" className="text-[15px] font-medium leading-6 text-ink">
            Email us at {f.contactEmail}
          </h2>
          <p className="text-pretty text-[13px] leading-5 text-muted">
            Say what happened and which device you use. Never send your bank password.
          </p>
        </div>
        </div>
        <a href={`mailto:${f.contactEmail}`} className={buttonClass("primary", "w-full sm:w-auto", "lg")}>
          <Icon name="mail" />
          Email support
        </a>
      </section>

      <section className="space-y-3">
        <SectionHead title="Common questions" />
        <ul className="px-card px-rows px-2 md:px-4">
          {QUESTIONS.map(({ q, a }) => (
            <li key={q} className="space-y-1 py-4 first:pt-2 last:pb-2 md:py-5 md:first:pt-4 md:last:pb-4">
              <h3 className="text-[15px] font-medium leading-6 text-ink">{q}</h3>
              <p className="text-pretty text-[15px] leading-6 text-graphite">{a}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Only once this deployment sells subscriptions (src/lib/billing/config.ts). */}
      {billingLive() ? (
      <section className="space-y-3">
        <SectionHead title="Manage or cancel a subscription" />
        <p className="text-pretty text-[15px] leading-6 text-graphite">
          Subscriptions are billed by Apple or Google, so you change or cancel them in your store account.
        </p>
        <ul className="px-card px-rows px-2 py-0.5 md:px-4 md:py-1">
          <ExternalRow href={APPLE_MANAGE_URL} label="Manage in the App Store" icon="smartphone" />
          <ExternalRow href={GOOGLE_MANAGE_URL} label="Manage in Google Play" icon="smartphone" />
        </ul>
      </section>
      ) : null}

      <p className="text-[13px] leading-5 text-muted">
        Budgts is published by {f.entityName}. Mailing address: {f.address}.
      </p>
    </div>
  );
}

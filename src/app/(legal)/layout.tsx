import Link from "next/link";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal/legal-doc";
import { LinkButton } from "@/components/ui";
import { legalFacts } from "@/lib/legal/config";

/**
 * The frame for the public Privacy, Terms, Support and Delete-your-account pages: readable signed out (they are
 * public in src/proxy.ts), linked from the stores, Google's OAuth consent screen and the apps. The brand top-left, one
 * way into the app, one reading column, and the footer naming the publisher. Each page 404s until the owner facts are
 * set (src/lib/legal/config.ts), so this frame never shows around a placeholder.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const facts = legalFacts();
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="mx-auto flex w-full max-w-[1136px] items-center justify-between px-6 py-4 md:px-12 md:py-7">
        <Link href="/" aria-label="Budgts home" className="press inline-flex">
          <Logo size={22} />
        </Link>
        {/* the app itself: sign-in, which sends a signed-in user on to the dashboard (`/` is the homepage signed out) */}
        <LinkButton href="/sign-in" variant="secondary">
          Open Budgts
        </LinkButton>
      </header>
      <main className="page-enter mx-auto w-full max-w-[1136px] flex-1 px-6 pb-12 pt-4 md:px-12 md:pt-8">{children}</main>
      {facts ? <LegalFooter entityName={facts.entityName} year={Number(facts.effectiveDate.slice(0, 4))} /> : null}
    </div>
  );
}

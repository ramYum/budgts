import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { IconName } from "@/components/icon";
import { LegalFooter } from "@/components/legal/legal-doc";
import { Logo } from "@/components/logo";
import { Robin } from "@/components/mascot";
import { Reveal } from "@/components/reveal";
import { GuideScene } from "@/components/tour/scenes";
import { IconTile, LinkButton } from "@/components/ui";
import { legalFacts } from "@/lib/legal/config";
import { siteUrl } from "@/lib/site";
import home from "./homepage.module.css";
import type { TourStepId } from "@/lib/tour/steps";

const TITLE = "Budgts: budgeting that does itself";
const DESCRIPTION =
  "Connect your bank and Budgts sorts your purchases, shows what's left this month and helps your savings grow. Coming soon to iPhone and Android.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  // Signed out, this page is budgts.com itself (src/proxy.ts rewrites / here): one address for search engines.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Budgts",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// The scenes are the welcome guide's (src/components/tour/scenes.tsx): built from the app's own parts with sample
// figures, never anyone's data. Each claim below is something Budgts does today.
const STEPS: { scene: TourStepId; title: string; body: string }[] = [
  {
    scene: "auto-capture",
    title: "Every purchase, tracked.",
    body: "Tap, swipe or shop online. Purchases show up on their own, with no typing and no receipts.",
  },
  {
    scene: "auto-sort",
    title: "Sorted for you.",
    body: "Each purchase lands in a category. Not sure about one? Budgts asks you once, then remembers.",
  },
  {
    scene: "money-left",
    title: "Know what's left.",
    body: "Money Left is what came in this month minus what went out. It's the one number to check.",
  },
  {
    scene: "plan",
    title: "Plan it. Then grow it.",
    body: "Give each category a monthly budget and watch it fill. Saving for something? Start a goal and add to it whenever you can.",
  },
];

// The privacy policy's short version, word for word in substance (src/app/(legal)/privacy/page.tsx).
const TRUST: { icon: IconName; title: string; body: string }[] = [
  { icon: "key", title: "We never see your bank login", body: "You sign in to your bank inside Plaid's window, not ours." },
  { icon: "eye", title: "Read-only", body: "Budgts can read balances and transactions. It can't move money." },
  { icon: "shield", title: "Not sold, no ads", body: "We don't sell your information, show ads or use trackers." },
  // What Google sign-in shares (Google's brand verification asks the homepage to say). Not "only name and email":
  // Supabase's Google sign-in also receives a profile-photo link in the account metadata.
  {
    icon: "google",
    title: "Signing in with Google",
    body: "Budgts uses the name and email address Google shares only to run your account.",
  },
];

const h2 = "text-balance text-[24px] font-semibold leading-8 tracking-tight text-ink md:text-[32px] md:leading-10";
const body = "text-pretty text-[15px] leading-6 text-graphite";
const at = (i: number) => ({ "--i": i }) as CSSProperties;

/** A scene on the app's dotted illustration stage. Decorative: the words beside it carry the meaning. */
function SceneStage({ id, className }: { id: TourStepId; className: string }) {
  return (
    <div className={`px-dots relative overflow-hidden ${id === "auto-capture" ? home.startFilled : ""} ${className}`} aria-hidden>
      <div className="mx-auto h-full max-w-sm">
        <GuideScene id={id} currency="USD" />
      </div>
    </div>
  );
}

function Section({ labelledBy, children, className }: { labelledBy: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={`pt-16 md:pt-24 ${className ?? ""}`}>
      {children}
    </section>
  );
}

/**
 * The company homepage of Budgts, LLC (spec §13a, Phase 1b): what Budgts is, that the apps are coming, a way in for
 * existing users, and the legal pages. Signed-out visitors of budgts.com see it at `/` (src/proxy.ts); signed-in users
 * keep their dashboard there. No prices (billing is off), no analytics or third-party scripts (the privacy policy
 * promises none), no store badges until the apps are live.
 */
export default function HomePage() {
  const facts = legalFacts();

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="mx-auto flex w-full max-w-[1136px] items-center justify-between px-6 py-4 md:px-12 md:py-7">
        <Link href="/" aria-label="Budgts home" className="press inline-flex">
          <Logo size={22} />
        </Link>
        <LinkButton href="/sign-in" variant="secondary">
          Sign in
        </LinkButton>
      </header>

      <main className="mx-auto w-full max-w-[1136px] flex-1 px-6 md:px-12">
        <section
          aria-labelledby="hero"
          className="page-enter grid gap-10 pt-6 md:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,464px)] lg:items-center lg:gap-16"
        >
          <div className="space-y-6">
            <p className="reveal px-tag text-muted" style={at(0)}>
              Track <span className="text-accent">:</span> Plan <span className="text-accent">:</span> Grow
            </p>
            <h1
              id="hero"
              className="reveal text-balance text-[34px] font-semibold leading-10 tracking-tight text-ink md:text-[48px] md:leading-[56px]"
              style={at(1)}
            >
              Budgeting that does itself.
            </h1>
            <p className="reveal max-w-[34rem] text-pretty text-[17px] leading-7 text-graphite" style={at(2)}>
              Connect your bank and Budgts sorts your purchases, shows what&apos;s left this month and helps your
              savings grow.
            </p>
            <p className="reveal flex items-center gap-3 pt-2 text-[15px] font-medium leading-6 text-ink" style={at(3)}>
              <IconTile name="smartphone" />
              Coming soon to iPhone and Android
            </p>
          </div>

          <div className="reveal px-card-raised" style={at(2)}>
            <SceneStage id="crystal" className="h-[248px] md:h-[320px]" />
          </div>
        </section>

        <Reveal i={0}>
          <Section labelledBy="bank" className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="space-y-6 lg:order-2">
              <div className="space-y-3">
                <h2 id="bank" className={h2}>
                  Connect your bank. Safely.
                </h2>
                <p className={`${body} max-w-[34rem]`}>
                  Budgts links to your bank through Plaid, read-only. Once it&apos;s connected, new purchases arrive on
                  their own.
                </p>
              </div>
              <ul className="space-y-4">
                {TRUST.map((t) => (
                  <li key={t.title} className="flex items-start gap-3">
                    <IconTile name={t.icon} />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium leading-6 text-ink">{t.title}</p>
                      <p className="text-pretty text-[13px] leading-5 text-muted">{t.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-card lg:order-1">
              <SceneStage id="bank" className="h-[236px]" />
            </div>
          </Section>
        </Reveal>

        <Reveal i={0}>
          <Section labelledBy="how" className="space-y-6 md:space-y-8">
            <h2 id="how" className={h2}>
              How Budgts works
            </h2>
            <ul className="grid gap-4 md:grid-cols-2 md:gap-6">
              {STEPS.map((s) => (
                <li key={s.scene} className="px-card flex flex-col">
                  <SceneStage id={s.scene} className="h-[236px]" />
                  <div className="space-y-1 px-2 pb-2 pt-4 md:px-4 md:pb-4">
                    <h3 className="text-[17px] font-semibold leading-6 text-ink">{s.title}</h3>
                    <p className={body}>{s.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </Reveal>

        <Reveal i={0}>
          <section aria-labelledby="sign-in" className="pb-12 pt-16 md:pb-24 md:pt-24">
            <div className="px-card-raised flex flex-col gap-6 p-2 sm:flex-row sm:items-center md:p-6">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Robin size={48} mood="happy" />
                <div className="min-w-0 space-y-1">
                  <h2 id="sign-in" className="text-[17px] font-semibold leading-6 text-ink">
                    Already have an account?
                  </h2>
                  <p className={body}>Sign in and pick up right where you left off.</p>
                </div>
              </div>
              <LinkButton href="/sign-in" size="lg" className="w-full sm:w-auto" arrow>
                Sign in
              </LinkButton>
            </div>
          </section>
        </Reveal>
      </main>

      {facts ? <LegalFooter entityName={facts.entityName} year={Number(facts.effectiveDate.slice(0, 4))} /> : null}
    </div>
  );
}

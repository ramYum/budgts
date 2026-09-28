import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, ExternalRow, P, textLink } from "@/components/legal/legal-doc";
import { Icon } from "@/components/icon";
import { IconTile, LinkButton, SectionHead } from "@/components/ui";
import { APPLE_MANAGE_URL, DELETION_SUBSCRIPTION_NOTICE, GOOGLE_MANAGE_URL } from "@/lib/billing/manage";
import { keepsRecordsAfterDeletion, yearsLabel } from "@/lib/legal/config";
import { billingLive } from "@/lib/billing/config";
import { lastUpdatedLine, requireLegalFacts } from "../require-facts";

export const metadata: Metadata = { title: "Delete your account" };

/** The in-app and web screen (src/app/(app)/settings/delete-account). Signed out, the proxy sends it through sign-in first. */
const DELETE_SCREEN = "/settings/delete-account";

/**
 * The public "delete your account" page Google Play requires (it must work without the app installed): how to delete,
 * what is removed and what is kept, and a way to start. Behavior: docs/specs/2026-09-19-account-deletion-design.md.
 * Nothing account-specific happens here: identity is established by signing in (the magic link or Google), and the
 * deletion itself runs on the signed-in screen, the same one the app's Settings opens. No ledger history means a hard
 * delete; a charge means the account is de-identified and the billing records kept.
 */
export default function AccountDeletionPage() {
  const f = requireLegalFacts();
  // Retention 0 (owner, 2026-09-28): nothing outlives a deleted account.
  const keeps = keepsRecordsAfterDeletion(f);

  return (
    <div className="space-y-6 md:max-w-[720px] md:space-y-8">
      <header className="space-y-2">
        <h1 className="px-title text-ink">Delete your account</h1>
        <p className="text-[13px] leading-5 text-muted">{lastUpdatedLine(f)}</p>
        <P>You can delete your Budgts account and its data at any time. Here&apos;s how, and exactly what happens.</P>
      </header>

      <section className="px-card-raised space-y-4 p-2 md:p-4" aria-labelledby="how">
        <h2 id="how" className="t-head text-ink">
          How to delete it
        </h2>
        <ol className="space-y-4">
          <li className="flex items-start gap-3">
            <IconTile name="smartphone" />
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-6 text-ink">In the app</p>
              <p className="text-pretty text-[13px] leading-5 text-muted">Open Settings, then Delete account.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <IconTile name="globe" />
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-6 text-ink">On the web, without the app</p>
              <p className="text-pretty text-[13px] leading-5 text-muted">
                Sign in with the email or Google account you use for Budgts, then confirm on the next screen.
              </p>
            </div>
          </li>
        </ol>
        <LinkButton href={DELETE_SCREEN} size="lg" icon="user-x" className="w-full sm:w-auto">
          Delete my account
        </LinkButton>
      </section>

      <section className="space-y-3">
        <SectionHead title="What's deleted" />
        <div className="px-card p-2 md:p-4">
          <Bullets
            items={[
              "Your profile, accounts, transactions, categories, budgets and savings goals.",
              "Every bank connection: Budgts disconnects it at Plaid and can no longer read that bank.",
              "Your sign-in. You're signed out everywhere and can't sign in to that account again.",
            ]}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="What's kept" />
        <div className="px-card space-y-3 p-2 md:p-4">
          {keeps ? (
            <P>
              Only if you ever paid for a subscription: the billing records of those payments, with your email and sign-in
              details removed, for {yearsLabel(f.retentionYears)} after deletion for accounting, tax and store
              reconciliation. Then they&apos;re deleted in line with our retention schedule.
            </P>
          ) : (
            <P>Nothing. Deleting your account deletes your data right away, as soon as you confirm.</P>
          )}
          <P>
            {keeps ? "Deletion starts as soon as you confirm and can't be undone. " : "It can't be undone. "}Copies in our database provider&apos;s backups
            disappear as those backups expire. The{" "}
            <Link href="/privacy#deleting-your-data" className={textLink}>
              privacy policy
            </Link>{" "}
            has the details.
          </P>
        </div>
      </section>

      {/* Only once this deployment sells subscriptions (src/lib/billing/config.ts). */}
      {billingLive() ? (
      <section className="space-y-3">
        <SectionHead title="Your subscription" />
        <div className="px-warn flex items-start gap-3 p-3 md:p-4">
          <Icon name="warning" className="text-warn" />
          <p className="text-pretty text-[15px] leading-6 text-ink">
            {DELETION_SUBSCRIPTION_NOTICE} Cancel it in your store account to stop being charged.
          </p>
        </div>
        <ul className="px-card px-rows px-2 py-0.5 md:px-4 md:py-1">
          <ExternalRow href={APPLE_MANAGE_URL} label="Manage in the App Store" icon="smartphone" />
          <ExternalRow href={GOOGLE_MANAGE_URL} label="Manage in Google Play" icon="smartphone" />
        </ul>
      </section>
      ) : null}

      <section className="space-y-2">
        <SectionHead title="Can't sign in?" />
        <P>
          Email{" "}
          <a href={`mailto:${f.contactEmail}`} className={textLink}>
            {f.contactEmail}
          </a>{" "}
          from the address on your account and we&apos;ll help you delete it.
        </P>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, KeyFacts, LegalDoc, P, textLink } from "@/components/legal/legal-doc";
import { keepsRecordsAfterDeletion, yearsLabel } from "@/lib/legal/config";
import { billingLive } from "@/lib/billing/config";
import { lastUpdatedLine, requireLegalFacts } from "../require-facts";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * The privacy policy. Every statement is what the code does today (audit: docs/specs/2026-09-19-account-deletion-design.md
 * §11): Supabase Auth + Postgres behind row-level security, Plaid for bank data (the access token AES-256-GCM encrypted,
 * the bank login never seen), store billing through RevenueCat, no analytics, advertising or crash-reporting SDK on the
 * web or in the apps, the two deletion paths. The owner facts (who, where, contact, retention period) come from
 * src/lib/legal/config.ts; without them this page is a 404.
 */
export default function PrivacyPage() {
  const f = requireLegalFacts();
  // Subscription wording only once this deployment sells subscriptions (src/lib/billing/config.ts).
  const paid = billingLive();
  // Retention 0 (owner, 2026-09-28): nothing outlives a deleted account, so no retention sentence at all.
  const keeps = keepsRecordsAfterDeletion(f);
  const mail = (
    <a href={`mailto:${f.contactEmail}`} className={textLink}>
      {f.contactEmail}
    </a>
  );

  return (
    <LegalDoc
      title="Privacy policy"
      updated={lastUpdatedLine(f)}
      intro={
        <P>
          How Budgts handles your information: what we collect, why, who helps us run the service, and how to delete it.
          This policy applies from when you first sign in to Budgts.
        </P>
      }
      lead={
        <KeyFacts
          title="The short version"
          facts={[
            { icon: "key", title: "We never see your bank login", body: "You sign in to your bank inside Plaid's window, not ours." },
            { icon: "eye", title: "Read-only", body: "Budgts can read balances and transactions. It can't move money." },
            { icon: "shield", title: "Not sold, no ads", body: "We don't sell your information, show ads or use trackers." },
            {
              icon: "trash",
              title: "Delete it any time",
              body: keeps
                ? "Deleting your account removes your data and bank connections."
                : "Deleting your account deletes your data right away, and disconnects your banks.",
            },
          ]}
        />
      }
      sections={[
        {
          id: "who-we-are",
          title: "Who we are",
          body: (
            <P>
              Budgts is published by {f.entityName}, which is responsible for the information you give Budgts in its iPhone
              and Android apps and at budgts.com. Our mailing address is {f.address}. Questions about privacy go to {mail}.
            </P>
          ),
        },
        {
          id: "what-we-collect",
          title: "What we collect",
          body: (
            <Bullets
              items={[
                <>
                  <strong className="font-semibold text-ink">Your account.</strong> Your email address. If you sign in with Google,
                  the name, email address and profile photo link Google shares with us.
                </>,
                <>
                  <strong className="font-semibold text-ink">Your settings.</strong> The currency you chose and your device&apos;s
                  time zone, so &ldquo;today&rdquo; and &ldquo;this month&rdquo; match where you are.
                </>,
                <>
                  <strong className="font-semibold text-ink">Banks you connect.</strong> When you connect a bank through Plaid we
                  receive the accounts you choose (name, type, the last four digits and balances) and their transactions
                  (date, amount, description, merchant and Plaid&apos;s category). We keep an access token so your accounts keep
                  syncing, encrypted and only ever used by our servers.
                </>,
                <>
                  <strong className="font-semibold text-ink">What you enter.</strong> Transactions you add yourself, categories,
                  budgets, savings goals, notes, and the category choices Budgts remembers for a merchant.
                </>,
                ...(paid
                  ? [
                      <>
                        <strong className="font-semibold text-ink">Your subscription.</strong> If you subscribe in the app: the
                        plan, its status and dates, and the purchase records Apple or Google report. We never receive your card
                        details.
                      </>,
                    ]
                  : []),
                <>
                  <strong className="font-semibold text-ink">Technical records.</strong> Our hosting provider logs requests (such
                  as the time, the page and the IP address) to keep the service secure and working.
                </>,
              ]}
            />
          ),
        },
        {
          id: "how-we-use-it",
          title: "How we use it",
          body: (
            <>
              <Bullets
                items={[
                  "To run your budget: sort transactions into categories, recognize transfers between your own accounts and recurring payments, and show what you have left to spend.",
                  "To sign you in, keep your account secure and answer you when you contact us.",
                  ...(paid ? ["To manage your subscription and what it unlocks."] : []),
                ]}
              />
              <P>
                Your figures are calculated from your own data only. We don&apos;t sell your personal information, share it for
                advertising, or show ads. Budgts has no analytics or tracking tools in the apps or on the website, and
                budgts.com only sets the cookies that keep you signed in.
              </P>
            </>
          ),
        },
        {
          id: "who-helps-us",
          title: "Who helps us run Budgts",
          body: (
            <>
              <P>These companies process information for us, only to provide their part of the service:</P>
              <Bullets
                items={[
                  <>
                    <strong className="font-semibold text-ink">Supabase</strong>: our database, sign-in and sign-in emails.
                  </>,
                  <>
                    <strong className="font-semibold text-ink">Vercel</strong>: hosting for budgts.com and our servers.
                  </>,
                  <>
                    <strong className="font-semibold text-ink">Plaid</strong>: connecting your bank. Plaid&apos;s handling of your
                    data is described in its{" "}
                    <a href="https://plaid.com/legal/#end-user-privacy-policy" className={textLink} target="_blank" rel="noreferrer">
                      end user privacy policy
                    </a>
                    .
                  </>,
                  <>
                    <strong className="font-semibold text-ink">Google</strong>: optional sign-in
                    {paid ? ", and billing for subscriptions bought in the Android app" : ""}.
                  </>,
                  ...(paid
                    ? [
                        <>
                          <strong className="font-semibold text-ink">Apple</strong>: billing for subscriptions bought in the
                          iPhone app.
                        </>,
                        <>
                          <strong className="font-semibold text-ink">RevenueCat</strong>: keeps track of subscriptions bought
                          through Apple and Google.
                        </>,
                      ]
                    : []),
                ]}
              />
              {/* Source: production Supabase in AWS us-east-2, Vercel functions in cle1 (vercel.json, docs/deploy.md).
                  Re-check this line if either region ever moves. */}
              <P>Our servers and database are in the United States.</P>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <P>
              Every record is tied to your account and the database refuses anyone else&apos;s request for it. Connections are
              encrypted in transit, bank access tokens are encrypted at rest, and our server credentials never reach the apps
              or your browser.
            </P>
          ),
        },
        {
          id: "deleting-your-data",
          title: "Keeping and deleting your data",
          body: (
            <>
              <P>
                We keep your information while you have an account. You can delete your account at any time in the app or on
                budgts.com (Settings, then Delete account), or from the{" "}
                <Link href="/account-deletion" className={textLink}>
                  account deletion page
                </Link>
                .{" "}
                {keeps
                  ? "Deletion starts as soon as you confirm:"
                  : "Deleting your account deletes your data right away, as soon as you confirm:"}
              </P>
              <Bullets
                items={[
                  "Your profile, accounts, transactions, categories, budgets and savings goals are deleted, and every connected bank is disconnected at Plaid.",
                  "You're signed out everywhere and can no longer sign in to that account.",
                  ...(keeps
                    ? [
                        <>
                          If you ever paid for a subscription, we keep the billing records of those payments, with your email
                          and sign-in details removed, for {yearsLabel(f.retentionYears)} after deletion for accounting, tax and
                          store reconciliation, then delete them in line with our retention schedule.
                        </>,
                      ]
                    : []),
                  "Operational logs that don't name you, such as our record of Plaid's messages about a connection, are kept to run the service.",
                  "Copies in our database provider's backups disappear as those backups expire.",
                ]}
              />
              {paid ? (
                <P>Deleting your account doesn&apos;t cancel an App Store or Google Play subscription. Cancel it in your store account.</P>
              ) : null}
            </>
          ),
        },
        {
          id: "your-choices",
          title: "Your choices",
          body: (
            <P>
              You can see and correct your information in the app, export your transactions as a CSV file from Settings on budgts.com, and
              delete your account yourself. For anything else, including a copy of your information, email {mail} from the
              address on your account.
            </P>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <P>Budgts is not directed to children under 13, and we don&apos;t knowingly collect their information.</P>,
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <P>
              When our practices change we update this page and its &ldquo;Last updated&rdquo; date.
            </P>
          ),
        },
      ]}
    />
  );
}

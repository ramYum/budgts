import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

/**
 * DRAFT privacy policy (see `../legal-status.ts`). Every statement here is grounded in what the code does today:
 * Supabase Auth + Postgres, Plaid for bank data (token encrypted at rest, credentials never seen), RevenueCat / Apple / Google
 * for subscription state, no analytics or crash-reporting SDK. Legal claims that are the owner's to make are marked
 * [Owner to confirm].
 */
export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-heading">Privacy Policy</h1>
      <p className="text-muted">Last updated: [Owner to confirm on approval]</p>

      <h2 className="pt-2 font-semibold text-heading">Who we are</h2>
      <p>
        Budgts is a budgeting app. [Owner to confirm: legal entity name, address and contact for privacy requests.]
      </p>

      <h2 className="pt-2 font-semibold text-heading">What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Your account:</strong> your email address, and the identifier from Google or Apple if you sign in with them.
        </li>
        <li>
          <strong>Bank data you connect:</strong> when you link a bank through Plaid we receive the accounts you choose and their
          transactions (merchant, amount, date, category). Your bank username and password are entered in Plaid&apos;s window
          and are never seen by Budgts. We keep an access token, encrypted, so your accounts can keep syncing.
        </li>
        <li>
          <strong>What you enter:</strong> manual transactions, categories, budgets and your chosen currency.
        </li>
        <li>
          <strong>Subscription status:</strong> whether you are on a free trial or subscribed, the plan and the dates, provided
          by Apple or Google through our subscription provider. We do not receive your card details.
        </li>
        <li>
          <strong>Technical logs:</strong> our servers record requests for security and reliability. [Owner to confirm:
          retention period.]
        </li>
      </ul>
      <p>
        Budgts does not currently use third-party analytics, advertising or crash-reporting tools in the app or on its servers.
        [Owner to confirm before publishing.]
      </p>

      <h2 className="pt-2 font-semibold text-heading">How we use it</h2>
      <p>
        To run your budget: categorize transactions, spot recurring payments and transfers, show what is left to spend, manage
        your subscription and, when enabled, email you a reminder before your free trial ends. We use it to keep the service
        secure. [Owner to confirm any other purpose.]
      </p>

      <h2 className="pt-2 font-semibold text-heading">Who processes it for us</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Supabase: database and sign-in.</li>
        <li>Vercel: hosting.</li>
        <li>Plaid: connecting to your bank.</li>
        <li>RevenueCat, Apple and Google: subscriptions and purchases; Apple and Google also for optional sign-in.</li>
        <li>Resend: trial-reminder email (when enabled).</li>
      </ul>
      <p>[Owner to confirm: statement on selling or sharing personal information, and international transfers.]</p>

      <h2 className="pt-2 font-semibold text-heading">Deleting your data</h2>
      <p>
        You can delete your account in the app (Settings → Delete account) or from{" "}
        <a className="text-accent underline" href="/account-deletion">
          the account-deletion page
        </a>
        . If you never paid, your account and its data are deleted. If you made a purchase, we keep the financial record of that
        payment without your personal details, as accounting and tax rules require. Deleting your account does not cancel an App
        Store or Google Play subscription; cancel that in your store account settings.
      </p>

      <h2 className="pt-2 font-semibold text-heading">Security</h2>
      <p>
        Your data is scoped to your account by database row-level security, transmitted over TLS, and bank access tokens are
        encrypted at rest.
      </p>

      <h2 className="pt-2 font-semibold text-heading">Your rights</h2>
      <p>
        You can ask to access, correct or delete your information. [Owner to confirm: rights by jurisdiction, and the response
        time.] Contact us through the{" "}
        <a className="text-accent underline" href="/support">
          support page
        </a>
        .
      </p>

      <h2 className="pt-2 font-semibold text-heading">Children</h2>
      <p>Budgts is not directed to children. [Owner to confirm: minimum age.]</p>

      <h2 className="pt-2 font-semibold text-heading">Changes</h2>
      <p>We will update this page when our practices change and note the date above.</p>
    </>
  );
}

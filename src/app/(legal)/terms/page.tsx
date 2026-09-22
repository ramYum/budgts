import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

/**
 * DRAFT terms (see `../legal-status.ts`). Subscription facts (7-day trial, $9.99/month, $79.99/year, store billing,
 * cancellation in the store) come from docs/specs/2026-09-21-v1-monetization-design.md (owner decision 2026-09-22).
 * Remaining legal terms are the owner's: marked [Owner to confirm].
 */
export default function TermsPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-heading">Terms of Service</h1>
      <p className="text-muted">Last updated: [Owner to confirm on approval]</p>

      <h2 className="pt-2 font-semibold text-heading">Using Budgts</h2>
      <p>
        Budgts helps you track spending and budgets. You need an account, and you are responsible for keeping your sign-in
        secure and for the accuracy of what you enter. [Owner to confirm: eligibility and minimum age.]
      </p>

      <h2 className="pt-2 font-semibold text-heading">Subscriptions and the free trial</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Budgts offers a 7-day free trial that you start yourself in the app. After the trial, your subscription
          automatically begins at $9.99/month or $79.99/year, depending on the plan you chose, unless you cancel first.
        </li>
        <li>
          Subscriptions are billed by Apple or Google. Unless you cancel at least 24 hours before the trial or period ends,
          the subscription starts or renews automatically and your store account is charged.
        </li>
        <li>
          You manage or cancel a subscription in your App Store or Google Play account settings; Budgts cannot cancel it for you.
          Refunds are handled by Apple or Google under their policies.
        </li>
        <li>Deleting your Budgts account does not cancel a store subscription.</li>
      </ul>

      <h2 className="pt-2 font-semibold text-heading">Your financial information</h2>
      <p>
        Budgts shows information from the accounts you connect and the entries you make. It is a budgeting tool, not financial,
        tax or legal advice, and figures depend on the data your bank provides, which can be delayed or incomplete. Check
        important numbers with your bank.
      </p>

      <h2 className="pt-2 font-semibold text-heading">Acceptable use</h2>
      <p>
        Do not misuse the service, attempt to access other people&apos;s data, or interfere with its operation. [Owner to
        confirm: full acceptable-use terms.]
      </p>

      <h2 className="pt-2 font-semibold text-heading">Ending your account</h2>
      <p>
        You can delete your account at any time in the app or from the{" "}
        <a className="text-accent underline" href="/account-deletion">
          account-deletion page
        </a>
        . We may suspend accounts that break these terms. [Owner to confirm.]
      </p>

      <h2 className="pt-2 font-semibold text-heading">Liability and governing law</h2>
      <p>[Owner to confirm: warranty disclaimer, limitation of liability, governing law and dispute resolution.]</p>

      <h2 className="pt-2 font-semibold text-heading">Changes and contact</h2>
      <p>
        We may update these terms and will note the date above. Questions:{" "}
        <a className="text-accent underline" href="/support">
          support
        </a>
        .
      </p>
    </>
  );
}

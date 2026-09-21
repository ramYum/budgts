import type { Metadata } from "next";

export const metadata: Metadata = { title: "Delete your account" };

/**
 * The public account-deletion request path Google Play requires (it must work without the app installed), and a
 * plain-language statement of what deletion does. Behaviour: docs/specs/2026-09-19-account-deletion-design.md — no ledger
 * history means a hard delete; a confirmed charge means the account is anonymised and the immutable financial ledger kept.
 */
export default function AccountDeletionPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-heading">Delete your Budgts account</h1>

      <h2 className="pt-2 font-semibold text-heading">How to delete it</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>In the app:</strong> Settings → Delete account.
        </li>
        <li>
          <strong>Without the app:</strong>{" "}
          <a className="text-accent underline" href="/settings/delete-account">
            sign in and delete your account here
          </a>
          . For your security you will be asked to sign in again right before it runs.
        </li>
        <li>
          <strong>Can&apos;t sign in?</strong> Ask us through the{" "}
          <a className="text-accent underline" href="/support">
            support page
          </a>{" "}
          from the email address on the account.
        </li>
      </ul>

      <h2 className="pt-2 font-semibold text-heading">What happens</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Your account, budgets, categories, transactions and connected-bank access are deleted, and your bank connections are
          disconnected.
        </li>
        <li>
          If you ever made a purchase, we keep the financial record of that payment without your name or email, as accounting
          and tax rules require.
        </li>
        <li>Deleting starts immediately when you confirm. It cannot be undone.</li>
      </ul>

      <h2 className="pt-2 font-semibold text-heading">Your subscription</h2>
      <p>
        Deleting your account does <strong>not</strong> cancel an App Store or Google Play subscription. To avoid further charges,
        cancel it in your store account settings —{" "}
        <a className="text-accent underline" href="/manage-subscription">
          here is where
        </a>
        .
      </p>
    </>
  );
}

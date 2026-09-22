import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support" };
// Read the contact address at request time so setting SUPPORT_EMAIL never needs a rebuild.
export const dynamic = "force-dynamic";

/**
 * Support page (the store listings' "support URL"). The contact address is configuration (`SUPPORT_EMAIL`): nothing is
 * invented — until the owner sets it the page says contact details are coming.
 */
export default function SupportPage() {
  const email = process.env.SUPPORT_EMAIL?.trim();

  return (
    <>
      <h1 className="text-xl font-semibold text-heading">Support</h1>

      <h2 className="pt-2 font-semibold text-heading">Contact us</h2>
      {email ? (
        <p>
          Email{" "}
          <a className="text-accent underline" href={`mailto:${email}`}>
            {email}
          </a>{" "}
          and tell us what happened and which device you use. Please don&apos;t include your bank password.
        </p>
      ) : (
        <p>Support contact details will be published here before launch.</p>
      )}

      <h2 className="pt-2 font-semibold text-heading">Common questions</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Manage or cancel a subscription:</strong> subscriptions are billed by Apple or Google, so they are changed in
          your store account.{" "}
          <a className="text-accent underline" href="/manage-subscription">
            Where to manage your subscription
          </a>
          .
        </li>
        <li>
          <strong>Delete my account:</strong> in the app under Settings → Delete account, or on the{" "}
          <a className="text-accent underline" href="/account-deletion">
            account-deletion page
          </a>
          .
        </li>
        <li>
          <strong>A bank isn&apos;t syncing:</strong> open Connected banks in the app to see its status and reconnect. If it
          still doesn&apos;t work, contact us.
        </li>
      </ul>
    </>
  );
}

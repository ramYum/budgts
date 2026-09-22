import type { Metadata } from "next";
import { APPLE_MANAGE_URL, GOOGLE_MANAGE_URL } from "@/lib/billing/manage";

export const metadata: Metadata = { title: "Manage your subscription" };

/**
 * Where "Manage subscription" links land — most importantly the link in the trial-end reminder email. It is PUBLIC (no
 * sign-in) on purpose, so the link always works, from any device, even for someone who is signed out or on a new phone.
 *
 * Budgts subscriptions are billed and managed by Apple or Google, and only the store can cancel or change them, so this
 * page is honest about that and sends the person straight to the right store settings. The store the reminder mentioned
 * (`?store=`) is listed first; both are always shown. No retention screens, no extra steps.
 */
export default async function ManageSubscriptionPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store } = await searchParams;
  const links = [
    { key: "apple", label: "Manage in the App Store", url: APPLE_MANAGE_URL, hint: "iPhone or iPad — opens your Apple subscriptions." },
    { key: "google", label: "Manage in Google Play", url: GOOGLE_MANAGE_URL, hint: "Android — opens your Google Play subscriptions." },
  ];
  if (store === "google") links.reverse();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 p-6">
      <h1 className="text-xl font-semibold">Manage your Budgts subscription</h1>
      <p className="text-sm text-muted">
        Your Budgts subscription is billed by Apple or Google, so it is changed or cancelled in their subscription
        settings. Pick the store you subscribed through — cancelling there takes effect at the end of your current free
        trial or billing period.
      </p>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.key} className="card rounded-2xl border border-hairline p-4">
            <a href={l.url} className="text-sm font-semibold text-heading underline underline-offset-2" rel="noreferrer">
              {l.label}
            </a>
            <p className="mt-1 text-sm text-muted">{l.hint}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Deleting your Budgts account does not automatically cancel your App Store or Google Play subscription — cancel it
        with the links above first if you no longer want it.
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getServerDb } from "@/lib/billing/db";
import type { EntitlementView } from "@/lib/billing/entitlement";
import { getEntitlementView } from "@/lib/billing/service";
import { APPLE_MANAGE_URL, GOOGLE_MANAGE_URL, manageUrlFor } from "@/lib/billing/manage";
import { formatPrice } from "@/lib/billing/reminders";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Subscription" };

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null);

/** Plain-language status. No claim beyond what the server-authoritative entitlement says. */
function describe(e: EntitlementView): { headline: string; detail: string } {
  const price = e.renewal ? formatPrice(e.renewal) : null;
  switch (e.status) {
    case "trialing":
      return e.willRenew
        ? { headline: "Free trial", detail: `Your free trial ends ${date(e.trialEndsAt) ?? "soon"}. After that your subscription starts automatically${price ? ` at ${price}` : ""} unless you cancel before then.` }
        : { headline: "Free trial (cancelled)", detail: `You cancelled, so your subscription will not start. You keep access until ${date(e.accessUntil) ?? "the trial ends"}.` };
    case "active":
      return e.willRenew
        ? { headline: "Subscribed", detail: `Renews automatically on ${date(e.accessUntil) ?? "your next billing date"}${price ? ` at ${price}` : ""}.` }
        : { headline: "Subscribed (cancelled)", detail: `You cancelled, so it will not renew. You keep access until ${date(e.accessUntil) ?? "the end of the period"}.` };
    case "grace":
      return { headline: "Payment problem", detail: `The store could not charge your payment method. You keep access until ${date(e.accessUntil) ?? "the grace period ends"} — update your payment method in the store to keep your subscription.` };
    case "expired":
      return { headline: "No active subscription", detail: "Your subscription has ended." };
    case "revoked":
      return { headline: "No active subscription", detail: "Your purchase was refunded, so access has ended." };
    default:
      return { headline: "No subscription", detail: "You don't have a Budgts subscription. You can start your free trial in the Budgts mobile app." };
  }
}

/**
 * Settings -> Subscription / Billing: a normal, predictable place to see subscription status and find the way to manage
 * or cancel it. Deliberately quiet — the Manage Subscription link lives here (and in the reminder email and the
 * account-deletion flow), not on the main pages — but never hidden or made harder to reach.
 */
export default async function SubscriptionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=%2Fsettings%2Fsubscription");

  let view: EntitlementView | null = null;
  try {
    view = await getEntitlementView(await getServerDb(), user.id);
  } catch {
    view = null; // status unavailable; the manage links below still work
  }
  const status = view ? describe(view) : null;
  const specific = manageUrlFor(view?.store);
  const links = specific
    ? [{ label: view?.store === "google" ? "Manage in Google Play" : "Manage in the App Store", url: specific }]
    : [
        { label: "Manage in the App Store", url: APPLE_MANAGE_URL },
        { label: "Manage in Google Play", url: GOOGLE_MANAGE_URL },
      ];

  return (
    <div className="space-y-4 pt-1">
      <PageHeader title="Subscription" back="/settings" />
      <div className="card space-y-2 rounded-2xl border border-hairline p-4">
        {status ? (
          <>
            <p className="text-sm font-semibold text-heading">{status.headline}</p>
            <p className="text-sm text-muted">{status.detail}</p>
          </>
        ) : (
          <p className="text-sm text-muted">We couldn&apos;t load your subscription status right now. You can still manage it below.</p>
        )}
      </div>

      <div className="card space-y-3 rounded-2xl border border-hairline p-4">
        <p className="text-sm font-semibold text-heading">Manage subscription</p>
        <p className="text-sm text-muted">
          Your subscription is billed by Apple or Google, so it is changed or cancelled in their subscription settings.
        </p>
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.url}>
              <a href={l.url} rel="noreferrer" className="inline-block rounded-full border border-hairline px-3 py-2 text-sm font-medium hover:bg-surface-2">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

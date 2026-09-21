/**
 * Where a user manages or cancels a store subscription. These are the STORES' own pages — Budgts cannot cancel an
 * Apple or Google subscription for anyone, so the honest, working thing is to send the user straight there.
 *
 * Used by: the public `/manage-subscription` page (the target of the "Manage subscription" link in the trial-end
 * reminder email), Settings -> Subscription / Billing, and the account-deletion flow. One definition, so no link can
 * drift out of date in one place and break in another.
 */
import type { Store } from "./entitlement";

export const APPLE_MANAGE_URL = "https://apps.apple.com/account/subscriptions";
export const GOOGLE_PACKAGE = "com.budgts.app";
export const GOOGLE_MANAGE_URL = `https://play.google.com/store/account/subscriptions?package=${GOOGLE_PACKAGE}`;

/** The store-specific page, or null when the store is not known. */
export function manageUrlFor(store: Store | null | undefined): string | null {
  if (store === "apple") return APPLE_MANAGE_URL;
  if (store === "google") return GOOGLE_MANAGE_URL;
  return null;
}

export const MANAGE_STORE_LINKS: ReadonlyArray<{ store: Store; label: string; url: string }> = [
  { store: "apple", label: "Manage in the App Store", url: APPLE_MANAGE_URL },
  { store: "google", label: "Manage in Google Play", url: GOOGLE_MANAGE_URL },
];

/** The Budgts page the reminder email links to. It needs no sign-in, so the link always works. */
export function manageSubscriptionPageUrl(siteUrl: string, store?: Store | null): string {
  const base = `${siteUrl.replace(/\/+$/, "")}/manage-subscription`;
  return store ? `${base}?store=${store}` : base;
}

/** The exact statement the owner approved for the deletion flow. */
export const DELETION_SUBSCRIPTION_NOTICE =
  "Deleting your Budgts account does not automatically cancel your App Store or Google Play subscription.";

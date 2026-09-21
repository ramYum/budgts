import { formatMoney } from "../home/format";
import type { EntitlementView } from "./contract";
import type { FlowState } from "./purchase-flow";

/**
 * Plain-language copy for the subscription screens. Wording mirrors the web Settings → Subscription page
 * (`src/app/(app)/(dashboard)/settings/subscription/page.tsx`) so a user sees the same words everywhere. Pure: it claims
 * nothing beyond what the server-authoritative entitlement (or the purchase flow's own state) says.
 */
const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;

export function describeSubscription(e: EntitlementView | null, loadFailed: boolean): { headline: string; detail: string } {
  if (!e) {
    return loadFailed
      ? {
          headline: "Subscription status unavailable",
          detail: "We couldn't load your subscription status right now. You can still manage it in the store.",
        }
      : { headline: "Checking your subscription…", detail: "" };
  }
  const price = e.renewal ? formatMoney(e.renewal.amount, e.renewal.currency) : null;
  switch (e.status) {
    case "trialing":
      return e.willRenew
        ? {
            headline: "Free trial",
            detail: `Your free trial ends ${date(e.trialEndsAt) ?? "soon"}. After that your subscription starts automatically${
              price ? ` at ${price}` : ""
            } unless you cancel before then.`,
          }
        : {
            headline: "Free trial (cancelled)",
            detail: `You cancelled, so your subscription will not start. You keep access until ${date(e.accessUntil) ?? "the trial ends"}.`,
          };
    case "active":
      return e.willRenew
        ? {
            headline: "Subscribed",
            detail: `Renews automatically on ${date(e.accessUntil) ?? "your next billing date"}${price ? ` at ${price}` : ""}.`,
          }
        : {
            headline: "Subscribed (cancelled)",
            detail: `You cancelled, so it will not renew. You keep access until ${date(e.accessUntil) ?? "the end of the period"}.`,
          };
    case "grace":
      return {
        headline: "Payment problem",
        detail: `The store could not charge your payment method. You keep access until ${
          date(e.accessUntil) ?? "the grace period ends"
        } — update your payment method in the store to keep your subscription.`,
      };
    case "expired":
      return { headline: "No active subscription", detail: "Your subscription has ended." };
    case "revoked":
      return { headline: "No active subscription", detail: "Your purchase was refunded, so access has ended." };
    default:
      return { headline: "No subscription", detail: "You don't have a Budgts subscription yet." };
  }
}

export type FlowMessage = { text: string; tone: "info" | "success" | "error" };

/** What to tell the user about the purchase flow. Null when there is nothing to say. Never echoes the store SDK's own text. */
export function describeFlow(state: FlowState): FlowMessage | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "purchasing":
      return { text: "Opening the store…", tone: "info" };
    case "confirming":
      return { text: "Confirming your purchase…", tone: "info" };
    case "premium":
      return { text: "You're all set — your subscription is active.", tone: "success" };
    case "not_confirmed":
      return {
        text: "The store completed your purchase, but we haven't been able to confirm it yet. This usually resolves in a moment — check again.",
        tone: "info",
      };
    case "pending":
      return { text: "Your purchase is waiting for approval. You'll get access as soon as it's approved.", tone: "info" };
    case "cancelled":
      return { text: "Purchase cancelled.", tone: "info" };
    case "nothing_to_restore":
      return { text: "We didn't find a purchase to restore for this store account.", tone: "info" };
    case "unavailable":
      return { text: "Subscriptions aren't available right now. Please try again later.", tone: "error" };
    case "error":
      return { text: "Something went wrong with the purchase. Please try again.", tone: "error" };
  }
}

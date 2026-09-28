/**
 * The subscription's commercial terms, in one place (docs/specs/2026-09-17-mobile-app-launch-design.md §9): what the
 * Terms of service state once billing is live. The store products carry the real prices (Apple/Google show the local
 * price before purchase); keep these equal to the US base plans configured there. Owner note: the annual price may move
 * from $69 to $79 once Plaid quotes its per-bank Production price; change it here and nowhere else.
 */
export const SUBSCRIPTION_TERMS = {
  currency: "USD",
  /** integer minor units */
  monthlyMinor: 999,
  annualMinor: 6900,
  trialDays: 7,
} as const;

/** "$9.99", "$69": whole amounts without cents. Display edge only. */
export function formatPlanPrice(minor: number, currency: string = SUBSCRIPTION_TERMS.currency): string {
  if (!Number.isInteger(minor)) throw new TypeError(`formatPlanPrice: expected integer minor units, got ${minor}`);
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Shown wherever paid terms would be while billing is off on this deployment (`billingLive()`). */
export const FREE_TODAY = "Budgts is free today. Before any paid plan starts, we'll update these terms.";

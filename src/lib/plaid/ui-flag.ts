/**
 * Whether to surface the Plaid "connect a bank" UI.
 *
 * Off by default. Production (`budgts.com`) stays off until the owner flips it
 * after Plaid Production approval and the 0004 migration is applied there
 * (design §27 step 5 — ship behind a flag). The staging deploy sets
 * `NEXT_PUBLIC_PLAID_ENABLED=1`.
 */
export function plaidUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PLAID_ENABLED === "1";
}

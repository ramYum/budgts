/**
 * What the user reads when a money-direction answer (design: 2026-10-01 card payments §5, §5a, §5b, §5c) can't be
 * applied. One set of sentences for the web Server Actions (`src/server/plaid/actions.ts`) and the native
 * `/api/mobile/plaid/sign-answer*` and `/api/mobile/plaid/removed-held/*` routes, so both surfaces say the same thing.
 */
export const SIGN_ANSWER_MESSAGES = {
  /** The form was tampered with or is out of date. */
  invalid: "Something went wrong. Refresh and try again.",
  /** A sync holds the bank's lease. */
  busy: "This bank is syncing right now. Try again in a moment.",
  /** The bank still awaits its account choices. */
  settingUp: "Finish choosing which accounts to import from this bank first.",
  /** The transaction asked about is no longer held (or not the caller's). */
  answerGone: "That transaction is no longer waiting. Refresh and try again.",
  /** "Change answer" on an account that isn't answered, or isn't the caller's. */
  cantChange: "This account can't change its answer. Refresh and try again.",
  /** "Change answer" on removed-bank rows that aren't answered, or aren't the caller's. */
  detachedCantChange: "These transactions can't change their answer. Refresh and try again.",
} as const;

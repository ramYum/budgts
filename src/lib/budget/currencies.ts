/**
 * Currencies offered in the picker. Restricted to 2-decimal currencies because
 * `src/lib/budget/money.ts` hardcodes a 2-decimal minor-unit exponent. Adding a
 * 0-decimal (JPY, KRW) or 3-decimal (BHD, KWD) currency requires making that
 * exponent currency-aware first — see the guard test in
 * `src/lib/validation/profile.test.ts`.
 *
 * Plain data, no Zod: the onboarding picker imports it without pulling the
 * validation library into the browser (`currencySchema` in
 * src/lib/validation/profile.ts validates against it).
 */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "SGD",
  "PHP",
  "INR",
  "AED",
  "ZAR",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

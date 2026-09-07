import { z } from "zod";

/** Currencies offered in the picker. Any is fine for `Intl.NumberFormat`. */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "SGD",
  "PHP",
  "INR",
  "AED",
  "ZAR",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const currencySchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
});

export type CurrencyInput = z.infer<typeof currencySchema>;

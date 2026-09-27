import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/budget/currencies";

export const currencySchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
});

export type CurrencyInput = z.infer<typeof currencySchema>;

/** True when this runtime's Intl can compute dates in `name`. */
function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/**
 * The user's IANA time zone, as their device reports it
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Validated by the
 * server's own Intl, which is what later computes their dates. Stored exactly
 * as reported, never canonicalised: <TimeZoneSync> compares the stored value
 * with the device's on every visit, so a rewritten alias would never match.
 */
export const timeZoneSchema = z.string().min(1).max(64).refine(isTimeZone, "Not a time zone");

/**
 * Money is stored and computed as integer minor units (e.g. cents) everywhere.
 * These helpers live at the display / input edge only — nothing else in the app
 * should convert between minor units and a decimal string.
 *
 * v1 assumes 2-decimal currencies (the common case, and v1 is single-currency).
 * Revisit `EXPONENT` if a 0- or 3-decimal currency is ever supported.
 */

const EXPONENT = 2;
const SCALE = 10 ** EXPONENT;

/** Integer count of minor units. */
export type Minor = number;

export function isMinor(value: unknown): value is Minor {
  return typeof value === "number" && Number.isInteger(value);
}

/** Format minor units as a localized currency string, e.g. 123450 -> "$1,234.50". */
export function formatMoney(minor: Minor, currency: string, locale?: string): string {
  if (!isMinor(minor)) {
    throw new TypeError(`formatMoney: expected integer minor units, got ${String(minor)}`);
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / SCALE);
}

/**
 * Parse a user-entered major-unit string ("12", "12.3", "1,234.50", "-0.99")
 * into integer minor units. Throws on anything it can't parse cleanly.
 */
export function parseMoney(input: string): Minor {
  const cleaned = input.trim().replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`parseMoney: cannot parse ${JSON.stringify(input)}`);
  }
  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = cleaned.replace("-", "").split(".");
  const minor = Number(whole) * SCALE + Number(fraction.padEnd(EXPONENT, "0"));
  return negative ? -minor : minor;
}

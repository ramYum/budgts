import { shiftDate } from "../dates";

/**
 * Display-only formatting for the Home screen. Mirrors the web app's
 * `src/lib/budget/money.ts` presentation (integer minor units, 2 decimals —
 * "v1 assumes 2-decimal currencies") so a figure reads the same on both. This
 * converts already-computed values to strings at the UI edge; it performs no
 * financial calculation.
 */
const SCALE = 100;

export function formatMoney(minor: number, currency: string, locale?: string): string {
  if (!Number.isInteger(minor)) {
    throw new TypeError(`formatMoney: expected integer minor units, got ${String(minor)}`);
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / SCALE);
}

/** A savings rate (fraction) as a rounded percentage; never clamped. */
export function formatSavingsRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** `2026-09` → "September 2026". */
export function formatMonthLabel(month: string, locale?: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y!, m! - 1, 1)),
  );
}

/**
 * Today / Yesterday / "Sep 16" for a transaction, like the web's `relativeDayLabel` (`src/lib/local-date.ts`). The
 * transaction's day is its stored UTC calendar day (dates are stored at noon UTC); `todayKey` is the user's own today
 * (`YYYY-MM-DD`) from the server, in their stored time zone, never the device's or UTC's clock.
 */
export function formatActivityDay(iso: string, todayKey: string, locale?: string): string {
  const day = new Date(iso).toISOString().slice(0, 10);
  if (day === todayKey) return "Today";
  if (day === shiftDate(todayKey, -1)) return "Yesterday";
  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Calendar-date helpers for the native screens. Dates are plain `YYYY-MM-DD` strings and months `YYYY-MM` keys — never
 * `Date` objects in state — so a transaction stays on the day the user chose regardless of time zone. "Today" is the device's
 * local date (that is what the person means); stored timestamps are read by their UTC day, exactly as the web ledger shows them.
 * Pure: `now` is injected.
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** The device's local calendar date. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The current month for the device's local date. */
export function currentMonth(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7);
}

/** Moves a `YYYY-MM-DD` date by whole days (calendar arithmetic, no DST or zone effects). */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `2026-09-10` → `2026-09`. */
export const monthOf = (iso: string): string => iso.slice(0, 7);

/** A stored timestamp (`2026-09-10T12:00:00+00:00`) → its `YYYY-MM-DD` day. */
export const dayOf = (timestamp: string): string => timestamp.slice(0, 10);

/** `2026-12` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

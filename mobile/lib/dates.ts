/**
 * Calendar-date helpers for the native screens. Dates are plain `YYYY-MM-DD` strings and months `YYYY-MM` keys — never
 * `Date` objects in state — so a transaction stays on the day the user chose regardless of time zone. "Today" and "this
 * month" are NOT computed here: they come from the server, in the user's stored time zone (`GET /api/mobile/profile`,
 * `useUserDates()`), exactly like the web. Stored timestamps are read by their UTC day, as the web ledger shows them.
 */
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

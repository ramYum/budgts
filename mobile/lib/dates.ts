/**
 * Calendar keys for the native screens. Dates are plain `YYYY-MM-DD` strings and months `YYYY-MM` keys, never `Date`
 * objects in state, so a transaction stays on the day the user chose regardless of time zone. "Today" and "this month"
 * are NOT computed here: they come from the server, in the user's stored time zone (`GET /api/mobile/profile`,
 * `useUserDates()`), exactly like the web. Shifting days and months, and every label, come from the web's own helpers
 * (lib/shared.ts: `shiftDateKey`, `shiftMonthKey`, `formatRelativeDay`, …).
 */

/** `2026-09-10` → `2026-09`. */
export const monthOf = (iso: string): string => iso.slice(0, 7);

/** A stored timestamp (`2026-09-10T12:00:00+00:00`) → its `YYYY-MM-DD` day. */
export const dayOf = (timestamp: string): string => timestamp.slice(0, 10);

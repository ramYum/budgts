/**
 * "Today" by the device's own clock.
 *
 * Transactions store a calendar date at noon UTC (see `dateToIso`). Server
 * pages decide "today" and "this month" in the user's stored time zone
 * (budget/month.ts); these helpers are for what the browser decides itself
 * from the device clock: Today/Yesterday labels, the greeting, the
 * contribution form's date. Pure: the timezone offset is an argument
 * (defaults to the runtime's), so tests pin it.
 */

/** YYYY-MM-DD of `d` for a timezone with `offsetMinutes` = Date#getTimezoneOffset(). */
export function dateKeyAt(d: Date, offsetMinutes: number): string {
  return new Date(d.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** The runtime's local calendar date (the user's, when run in the browser). */
export function localDateKey(d: Date = new Date()): string {
  return dateKeyAt(d, d.getTimezoneOffset());
}

/** Shift a YYYY-MM-DD key by whole days. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, dd] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd! + days)).toISOString().slice(0, 10);
}

/** "Today" / "Yesterday" relative to `todayKey`, else the formatted date. */
export function relativeDayLabel(
  occurredIso: string,
  todayKey: string,
  format: (iso: string) => string,
): string {
  const key = new Date(occurredIso).toISOString().slice(0, 10);
  if (key === todayKey) return "Today";
  if (key === shiftDateKey(todayKey, -1)) return "Yesterday";
  return format(occurredIso);
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

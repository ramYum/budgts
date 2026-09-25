/**
 * "Today" in the user's own timezone.
 *
 * Transactions store a calendar date at noon UTC (see `dateToIso`), and
 * server code runs in UTC — so a server-computed "today" is the UTC calendar
 * day, which for a US user is already tomorrow every evening. Anything that
 * means "the user's today" (default form date, Today/Yesterday labels, the
 * greeting) must be decided in the browser from these helpers. Pure: the
 * timezone offset is an argument (defaults to the runtime's), so tests pin it.
 */

import { todayDateKey } from "@/lib/budget/month";

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

/**
 * Server pages pass "today" as the form's default date when the current month
 * is shown — decided in the app time zone (America/New_York, see
 * budget/month.ts; older builds used UTC). In the browser, swap that for the
 * user's local today; any other default (a past/future month's mid-point) is
 * kept.
 */
export function resolveDefaultDate(
  serverDefault: string,
  now: Date = new Date(),
  offsetMinutes: number = now.getTimezoneOffset(),
): string {
  const isServerToday = serverDefault === todayDateKey(now) || serverDefault === dateKeyAt(now, 0);
  return isServerToday ? dateKeyAt(now, offsetMinutes) : serverDefault;
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

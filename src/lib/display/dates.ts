/**
 * Date and month labels, one source for the web and the apps. A transaction's
 * date is a calendar day stored at noon UTC, so every label reads it in UTC:
 * the same day in any viewer's time zone. `locale` is the runtime's (the
 * browser's, the phone's) unless given. Pure: no clock is read here except
 * where a `now` is passed in.
 */
import { relativeDayLabel } from "./local-date.ts";

const UTC = "UTC";

/** "Sep 20": a transaction's day, short (Activity rows, Needs a category, Today/Yesterday's fallback). */
export function formatDayShort(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: UTC });
}

/** "Today" / "Yesterday" relative to `todayKey` (YYYY-MM-DD), else "Sep 20". */
export function formatRelativeDay(iso: string, todayKey: string, locale?: string): string {
  return relativeDayLabel(iso, todayKey, (d) => formatDayShort(d, locale));
}

/** "Tue, Sep 29": a day's heading in the Activity list. */
export function formatDayHeading(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", timeZone: UTC });
}

/** "Tuesday, September 29, 2026": a transaction's full date in its detail. */
export function formatFullDate(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: UTC });
}

/** "2027-04-01" → "Apr 2027": a goal's target date, short enough to share the "to go" line. */
export function formatTargetDate(date: string, locale?: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: UTC });
}

/** "2026-09" → "September 2026": the month switcher's label. */
export function formatMonthLabel(month: string, locale?: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: UTC });
}

/** "2026-09" → "Sep" / "September": a chart column's month, always in English like the web's charts. */
export function formatMonthName(month: string, style: "short" | "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-US", { month: style, timeZone: UTC });
}

/** "2026-12" moved by `delta` whole months ("2027-01" for +1). */
export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** "just now", "12 min ago", "3 hr ago", else the day: when a bank last synced, as of `nowMs`. */
export function formatSyncedAgo(iso: string, nowMs: number, locale?: string): string {
  const mins = Math.round((nowMs - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

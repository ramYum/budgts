/**
 * The owner's time zone (Pennsylvania). Servers run in UTC, so "this month" and
 * "today" must be decided here rather than from the server clock, or they roll
 * over hours early every evening. Personal-use app: one fixed zone.
 */
export const APP_TIME_ZONE = "America/New_York";

/** Today's calendar date (`YYYY-MM-DD`) in {@link APP_TIME_ZONE}. */
export function todayDateKey(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The current month as `YYYY-MM` in {@link APP_TIME_ZONE}. */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return todayDateKey(now).slice(0, 7);
}

/** A calendar month as `YYYY-MM`, always in UTC. */
export type MonthKey = string;

/** Format a date as its UTC `YYYY-MM` month key. */
export function monthKey(date: Date): MonthKey {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

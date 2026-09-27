/**
 * "Today" and "this month" belong to the user, not the server: servers run in
 * UTC, so deciding them from the server clock rolls the month over hours early
 * (or late) for anyone not in London. Every caller passes the user's own IANA
 * time zone (`profiles.time_zone`, taken from their device and kept in step
 * with it by <TimeZoneSync>), so a user in Tokyo and a user in Los Angeles each
 * see their own month boundaries.
 */

/** Today's calendar date (`YYYY-MM-DD`) in `timeZone`. */
export function todayDateKey(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The current month as `YYYY-MM` in `timeZone`. */
export function currentMonthKey(timeZone: string, now: Date = new Date()): MonthKey {
  return todayDateKey(timeZone, now).slice(0, 7);
}

/** A calendar month as `YYYY-MM`, always in UTC. */
export type MonthKey = string;

/** Format a date as its UTC `YYYY-MM` month key. */
export function monthKey(date: Date): MonthKey {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** A calendar month as `YYYY-MM`, always in UTC. */
export type MonthKey = string;

/** Format a date as its UTC `YYYY-MM` month key. */
export function monthKey(date: Date): MonthKey {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

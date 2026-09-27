/**
 * A time zone as a person reads it: "New York · Eastern Daylight Time" for
 * `America/New_York` in summer. The name follows daylight saving at `now`.
 */
export function timeZoneLabel(timeZone: string, now: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;
  const slash = timeZone.lastIndexOf("/");
  const city = slash === -1 ? null : timeZone.slice(slash + 1).replace(/_/g, " ");
  return [city, name].filter(Boolean).join(" · ");
}

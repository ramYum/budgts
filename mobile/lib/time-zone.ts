import { getCalendars } from "expo-localization";

/**
 * The IANA time zone the device reports (`America/Chicago`), or null when it reports none. Sent at Get Started and
 * whenever it differs from the stored one, so the server's "today" and "this month" follow the user (the same rule the
 * web's <TimeZoneSync> follows). The server validates it; the app never computes dates from it.
 */
export function deviceTimeZone(): string | null {
  const zone = getCalendars()[0]?.timeZone;
  return typeof zone === "string" && zone.length > 0 ? zone : null;
}

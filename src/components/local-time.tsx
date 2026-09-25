"use client";

import { useSyncExternalStore } from "react";
import { dateKeyAt, greetingForHour, localDateKey, relativeDayLabel } from "@/lib/local-date";

// The wall clock isn't a subscribable store; a page reload/refresh re-reads it.
const subscribe = () => () => {};

/**
 * Time-of-day bits that must follow the USER's clock, not the server's (UTC).
 * The server render uses UTC (the only clock it has); after hydration the
 * browser re-renders with the local value — useSyncExternalStore's
 * server-snapshot path, so there's no hydration mismatch.
 */
export function Greeting() {
  const hour = useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => new Date().getUTCHours(),
  );
  return <>{greetingForHour(hour)}</>;
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Today" / "Yesterday" / "Sep 20" for a stored calendar date (noon UTC). */
export function RelativeDay({ iso }: { iso: string }) {
  const todayKey = useSyncExternalStore(
    subscribe,
    () => localDateKey(),
    () => dateKeyAt(new Date(), 0),
  );
  return <>{relativeDayLabel(iso, todayKey, formatShort)}</>;
}

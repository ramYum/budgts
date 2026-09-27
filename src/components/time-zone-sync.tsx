"use client";

import { startTransition, useEffect, useRef } from "react";
import { syncTimeZone } from "@/server/time-zone";

/** The IANA time zone this device is set to. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Keeps the user's stored time zone in step with where they are. When the app
 * opens, and each time it comes back to the foreground (a traveller opening it
 * after landing), it compares the device's zone with the stored one and, if
 * they differ, stores the device's. The action re-renders the page with the
 * new "today" and "this month". Event-driven: no timers, no polling.
 */
export function TimeZoneSync({ stored }: { stored: string | null }) {
  // The zone last sent, so a zone the server refuses isn't resent on every
  // foreground event.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const zone = deviceTimeZone();
      if (!zone || zone === stored || zone === sent.current) return;
      sent.current = zone;
      startTransition(async () => {
        const result = await syncTimeZone(zone);
        if (!result.ok) console.error("[time zone] couldn't store the device's zone", zone, result.error);
      });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [stored]);

  return null;
}

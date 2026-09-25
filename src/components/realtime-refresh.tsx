"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Quiet period after the last change before the page is refreshed. */
const DEBOUNCE_MS = 1500;

/**
 * Refreshes the current route when any of the given tables change for this
 * user. Realtime is RLS-scoped, so we only receive our own rows. Coarse (any
 * change refreshes), which is fine for a single-user month view.
 *
 * A bank sync lands hundreds of row events in a burst; each router.refresh()
 * re-runs the whole server render (layout + page queries), so refreshing per
 * event made the app crawl while a sync ran. Events are coalesced into one
 * trailing refresh, and a hidden tab defers it until it is visible again.
 */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`refresh:${key}`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const flush = () => {
      timer = null;
      if (document.hidden) return; // resumed by onVisible
      pending = false;
      router.refresh();
    };
    const schedule = () => {
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (!document.hidden && pending && !timer) schedule();
    };

    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [router, key]);

  return null;
}

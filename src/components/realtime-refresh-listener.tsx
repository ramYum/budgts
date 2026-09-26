"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Quiet period after the last change before the page is refreshed. */
const DEBOUNCE_MS = 1500;

/**
 * Refreshes the current route when one of the given tables changes AFTER the
 * page on screen was rendered — i.e. changes this tab's own actions can't know
 * about: a background bank sync landing rows, or an edit on another device.
 * Rendered by the server `<RealtimeRefresh>`, which passes `renderedAt`.
 *
 * The user's own edits are refreshed by their server action (revalidatePath
 * re-renders the page in the action's response, with a newer `renderedAt`).
 * Their row events come back over realtime too — often before that response
 * — so an event only counts if it committed after the latest render seen at
 * flush time; otherwise the page already shows it and a refresh would be a
 * second, redundant server render.
 *
 * A bank sync lands hundreds of row events in a burst; each router.refresh()
 * re-runs the whole server render, so events are coalesced into one trailing
 * refresh, and a hidden tab defers it until it is visible again. Realtime is
 * RLS-scoped: only this user's rows arrive.
 */
export function RealtimeRefreshListener({ tables, renderedAt }: { tables: string[]; renderedAt: number }) {
  const router = useRouter();
  const key = tables.join(",");
  const renderedAtRef = useRef(renderedAt);

  useEffect(() => {
    renderedAtRef.current = Math.max(renderedAtRef.current, renderedAt);
  }, [renderedAt]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let newestChange = 0;

    const stale = () => newestChange > renderedAtRef.current;
    const flush = () => {
      timer = null;
      if (!stale()) return; // a newer render already includes these changes
      if (document.hidden) return; // resumed by onVisible
      newestChange = 0;
      router.refresh();
    };
    const onChange = (payload: { commit_timestamp?: string }) => {
      const committed = payload.commit_timestamp ? Date.parse(payload.commit_timestamp) : Number.NaN;
      // No usable timestamp: treat as new rather than risk a stale screen.
      const at = Number.isNaN(committed) ? Number.POSITIVE_INFINITY : committed;
      if (at <= renderedAtRef.current) return;
      newestChange = Math.max(newestChange, at);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (!document.hidden && stale() && !timer) timer = setTimeout(flush, DEBOUNCE_MS);
    };

    // The Supabase browser client (~250 KB) is only needed here, so it loads
    // once the page is up instead of in every page's first bundle.
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    void import("@/lib/supabase/client").then(({ createClient }) => {
      if (cancelled) return;
      const supabase = createClient();
      const channel = supabase.channel(`refresh:${key}`);
      for (const table of key.split(",")) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
      }
      channel.subscribe();
      unsubscribe = () => void supabase.removeChannel(channel);
    });
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe?.();
    };
  }, [router, key]);

  return null;
}

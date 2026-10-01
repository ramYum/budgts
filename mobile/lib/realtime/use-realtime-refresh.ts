import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/auth-context";
import { invalidate } from "../api/invalidate";
import { supabase } from "../supabase/client";
import { createCoalescer } from "./coalescer";
import { topicsFor, type RealtimeTable } from "./topics";

type Watch = { count: number; close: () => void };

/** The open watches, one per table and user, shared by every mounted screen that watches that table. */
const watches = new Map<string, Watch>();
/** Each channel's topic is new: realtime-js hands back the channel it still holds for a topic (one being removed included). */
let channelSeq = 0;

/**
 * Starts (or joins) the watch on one table for one user and returns its release. Tab screens stay mounted, so Home and
 * Budgets watch `budgets` at the same time: they share ONE channel, reference-counted, closed when the last one leaves.
 * (realtime-js 2.x `channel(topic)` returns the existing channel for a topic; a second screen calling `.on()` on it
 * after `subscribe()` throws, and one screen's `removeChannel` would silence the other.)
 */
export function watchTable(table: RealtimeTable, userId: string): () => void {
  const id = `${table}:${userId}`;
  let watch = watches.get(id);
  if (!watch) {
    const coalescer = createCoalescer(() => invalidate(...topicsFor([table])), { active: AppState.currentState === "active" });
    const channel = supabase
      .channel(`refresh:${id}:${++channelSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, () => coalescer.change());
    channel.subscribe();
    const app = AppState.addEventListener("change", (s) => coalescer.setActive(s === "active"));
    watch = {
      count: 0,
      close: () => {
        app.remove();
        coalescer.dispose();
        void supabase.removeChannel(channel);
      },
    };
    watches.set(id, watch);
  }
  const mine = watch;
  mine.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mine.count -= 1;
    if (mine.count > 0) return;
    watches.delete(id);
    mine.close();
  };
}

/**
 * Keeps a screen fresh when rows it shows change elsewhere (a background bank
 * sync, an edit on another device), mirroring where the web mounts
 * <RealtimeRefresh tables={…}>: the tabs layout watches `transactions`, Home and
 * Budgets add `budgets`, Goals adds the two goal tables (lib/realtime/topics.ts).
 * One Supabase Realtime channel per table on the user's own rows (RLS-scoped,
 * filtered by user), shared by every screen watching it (`watchTable`); events
 * coalesced into one trailing refresh, deferred while the app is in the
 * background; the refresh invalidates the topics that show those rows, so each
 * screen reloads in place through its version. No polling.
 */
export function useRealtimeRefresh(tables: readonly RealtimeTable[]): void {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const key = [...new Set(tables)].sort().join(",");

  useEffect(() => {
    if (!userId || !key) return;
    const releases = (key.split(",") as RealtimeTable[]).map((table) => watchTable(table, userId));
    return () => {
      for (const release of releases) release();
    };
  }, [userId, key]);
}

import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/auth-context";
import { invalidate } from "../api/invalidate";
import { supabase } from "../supabase/client";
import { createCoalescer } from "./coalescer";
import { topicsFor, type RealtimeTable } from "./topics";

/**
 * Keeps a screen fresh when rows it shows change elsewhere (a background bank
 * sync, an edit on another device), mirroring where the web mounts
 * <RealtimeRefresh tables={…}>: the tabs layout watches `transactions`, Home and
 * Budgets add `budgets`, Goals adds the two goal tables (lib/realtime/topics.ts).
 * One Supabase Realtime channel on the user's own rows (RLS-scoped, filtered by
 * user), events coalesced into one trailing refresh, deferred while the app is
 * in the background; the refresh invalidates the topics that show those rows,
 * so each screen reloads through its own key. No polling.
 */
export function useRealtimeRefresh(tables: readonly RealtimeTable[]): void {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const key = [...tables].sort().join(",");

  useEffect(() => {
    if (!userId || !key) return;
    const watched = key.split(",") as RealtimeTable[];
    const coalescer = createCoalescer(() => invalidate(...topicsFor(watched)), { active: AppState.currentState === "active" });
    const channel = supabase.channel(`refresh:${key}:${userId}`);
    for (const table of watched) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, () => coalescer.change());
    }
    channel.subscribe();
    const app = AppState.addEventListener("change", (s) => coalescer.setActive(s === "active"));
    return () => {
      app.remove();
      coalescer.dispose();
      void supabase.removeChannel(channel);
    };
  }, [userId, key]);
}

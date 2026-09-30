import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/auth-context";
import { invalidate, type Topic } from "../api/invalidate";
import { supabase } from "../supabase/client";
import { createCoalescer } from "./coalescer";

/**
 * Keeps every screen fresh after a background bank sync lands rows (or an
 * edit on another device), like the web's <RealtimeRefresh tables={["transactions"]}>
 * in the dashboard layout: one Supabase Realtime channel on the user's own
 * rows (RLS-scoped), events coalesced into one trailing refresh, deferred
 * while the app is in the background. The refresh is an `invalidate()` of the
 * topics that show transactions, so each screen reloads through its own key.
 */
const TOPICS: Topic[] = ["transactions", "home", "budgets", "accounts"];

export function useRealtimeRefresh(tables: readonly string[] = ["transactions"]): void {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const key = tables.join(",");

  useEffect(() => {
    if (!userId) return;
    const coalescer = createCoalescer(() => invalidate(...TOPICS), { active: AppState.currentState === "active" });
    const channel = supabase.channel(`refresh:${key}:${userId}`);
    for (const table of key.split(",")) {
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

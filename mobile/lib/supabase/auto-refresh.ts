import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "./client";

/**
 * Supabase's token auto-refresh timer keeps running in JS even while the app
 * is backgrounded, which wastes battery and can miss a refresh that should
 * happen right at foreground. This is the vendor-documented React Native
 * pattern: drive `startAutoRefresh`/`stopAutoRefresh` off `AppState` instead
 * of leaving the timer free-running. Call once from the root layout.
 */
export function registerSupabaseAutoRefresh(): () => void {
  const handleChange = (state: AppStateStatus) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  const subscription = AppState.addEventListener("change", handleChange);
  if (AppState.currentState === "active") supabase.auth.startAutoRefresh();

  return () => subscription.remove();
}

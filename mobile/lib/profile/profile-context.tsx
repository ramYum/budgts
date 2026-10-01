import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import { jsonInit } from "../api/request";
import { deviceTimeZone } from "../time-zone";
import { completeTour as postCompleteTour, type CompleteTourResult } from "../tour/tour-api";
import { loadProfile, saveCurrency, saveTimeZone, type ProfileState, type SaveCurrencyResult } from "./profile-api";
import { ProfileContext } from "./profile-hooks";

// The context and its hooks live in ./profile-hooks (React only), so a leaf component (the kit DateField) can read the
// user's "today" without importing the provider's network and auth modules.
export { useProfile, useUserDates } from "./profile-hooks";

const ZONE_MISSING: SaveCurrencyResult = {
  status: "error",
  kind: "time_zone",
  message: "Your phone didn't report a time zone Budgts recognises. Check its date and time settings, then try again.",
};

/**
 * Loads `GET /api/mobile/profile` for the signed-in user. The signed-in app shell reads `state` to decide between Get
 * Started and the app. The server's `month` / `today` (the user's own, in their stored zone) drive every screen's
 * "this month" and "today".
 *
 * Time zone, the rule the web's <TimeZoneSync> follows: whenever the app comes back to the foreground (an AppState
 * event, no timers), the profile is re-read quietly and, if the device now reports a different zone, the new zone is
 * stored and the profile read again, so "today" follows the user when they travel and rolls over at their midnight.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  // Token refreshes swap the session object; loaders read it through a ref so they don't re-run (and flash `loading`).
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [justOnboarded, setJustOnboarded] = useState(false);

  const fetchProfile = useCallback(() => loadProfile(() => authFetch("/api/mobile/profile", sessionRef.current)), []);

  /** Stores the device's zone if it differs from the stored one; returns the profile to show. */
  const syncZone = useCallback(async (next: Awaited<ReturnType<typeof fetchProfile>>) => {
    if (next.status !== "ready" || !next.profile.onboarded) return next;
    const zone = deviceTimeZone();
    if (!zone || zone === next.profile.timeZone) return next;
    const saved = await saveTimeZone(() => authFetch("/api/mobile/profile", sessionRef.current, jsonInit("PATCH", { time_zone: zone })));
    return saved ? await fetchProfile() : next;
  }, [fetchProfile]);

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    const next = await syncZone(await fetchProfile());
    if (alive.current) setState(next);
  }, [fetchProfile, syncZone]);

  /** A foreground refresh: no loading flash, and a failed read keeps what is on screen. */
  const refreshQuietly = useCallback(async () => {
    const next = await syncZone(await fetchProfile());
    if (alive.current && next.status === "ready") setState(next);
  }, [fetchProfile, syncZone]);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (userId) void reload();
  }, [userId, reload]);

  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refreshQuietly();
    });
    return () => sub.remove();
  }, [userId, refreshQuietly]);

  const chooseCurrency = useCallback(
    async (currency: string) => {
      const zone = deviceTimeZone();
      if (!zone) return ZONE_MISSING;
      const result = await saveCurrency(() =>
        authFetch("/api/mobile/onboarding", sessionRef.current, jsonInit("POST", { currency, time_zone: zone })),
      );
      if (result.status === "saved") {
        // Re-read in place: the onboarding card keeps "Saving…" until the gate swaps to the tour. A failed read shows
        // the shell's error state with Try again; the currency is already saved, so nothing is lost.
        const next = await fetchProfile();
        if (alive.current) {
          setJustOnboarded(true);
          setState(next);
        }
      } else if (result.status === "already_onboarded") {
        await reload();
      }
      return result;
    },
    [fetchProfile, reload],
  );

  const completeTour = useCallback(async () => {
    const result = await postCompleteTour(() => authFetch("/api/mobile/tour", sessionRef.current, jsonInit("POST", {})));
    if (result.status === "done" && alive.current) {
      // The server stamped it: the gate's flag follows what it confirmed (no second read needed).
      setJustOnboarded(false);
      setState((prev) => (prev.status === "ready" ? { status: "ready", profile: { ...prev.profile, tourSeen: true } } : prev));
    }
    return result;
  }, []);

  const value = useMemo(
    () => ({ state, reload, chooseCurrency, justOnboarded, completeTour }),
    [state, reload, chooseCurrency, justOnboarded, completeTour],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

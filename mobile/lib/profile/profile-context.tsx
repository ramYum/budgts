import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import { jsonInit } from "../api/request";
import { loadProfile, saveCurrency, type ProfileState, type SaveCurrencyResult } from "./profile-api";

type ProfileContextValue = {
  state: ProfileState;
  /** Re-reads the profile (shows `loading`). Used after onboarding and for "Try again". */
  reload: () => Promise<void>;
  /** Saves the first-run currency; on success (or "another device already did") the profile is reloaded. */
  chooseCurrency: (currency: string) => Promise<SaveCurrencyResult>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Loads `GET /api/mobile/profile` for the signed-in user. The signed-in app shell reads `state` to decide between the
 * Get Started (currency) screen and the app — a native-only user has no other way to set a currency.
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

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    const next = await loadProfile(() => authFetch("/api/mobile/profile", sessionRef.current));
    if (alive.current) setState(next);
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (userId) void reload();
  }, [userId, reload]);

  const chooseCurrency = useCallback(
    async (currency: string) => {
      const result = await saveCurrency(() =>
        authFetch("/api/mobile/onboarding", sessionRef.current, jsonInit("POST", { currency })),
      );
      if (result.status === "saved" || result.status === "already_onboarded") await reload();
      return result;
    },
    [reload],
  );

  const value = useMemo(() => ({ state, reload, chooseCurrency }), [state, reload, chooseCurrency]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used inside <ProfileProvider>");
  return value;
}

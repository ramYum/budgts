import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { authFetch } from "../auth/api";
import { loadResource } from "../api/load";
import { useVersion } from "../api/invalidate";
import { useResource } from "../api/use-resource";
import { parseStatus, type MobileStatus } from "./status-api";

/**
 * The shell's status (`GET /api/mobile/status`) for every signed-in screen:
 * the header bell and the banners read it from here, so one request serves
 * them all. It reloads whenever transactions or accounts change (a save, a
 * realtime sync landing) and whenever the app comes back to the foreground
 * (an AppState event: a sync may have landed while it was away); never on a
 * timer. Before the first answer, or if the first load fails, the shell shows
 * no bell count and no banners: the screens' own data states carry any
 * failure, so a status hiccup never blocks a screen. A failed reload keeps the
 * last answer (`useResource`'s silent reload), so the bell never flickers.
 */
const StatusContext = createContext<MobileStatus | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const tx = useVersion("transactions");
  const accounts = useVersion("accounts");
  const [foreground, setForeground] = useState(0);
  useEffect(() => {
    let current = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && current !== "active") setForeground((n) => n + 1);
      current = next;
    });
    return () => sub.remove();
  }, []);
  const { state } = useResource(
    "status",
    (session) => loadResource(() => authFetch("/api/mobile/status", session), parseStatus),
    { version: `${tx}:${accounts}:${foreground}` },
  );
  return <StatusContext.Provider value={state.status === "ready" ? state.data : null}>{children}</StatusContext.Provider>;
}

/** The latest status, or null until the first answer arrives (and while the first load has failed). */
export function useStatus(): MobileStatus | null {
  return useContext(StatusContext);
}

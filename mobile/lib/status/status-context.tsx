import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authFetch } from "../auth/api";
import { loadResource } from "../api/load";
import { useVersion } from "../api/invalidate";
import { useResource } from "../api/use-resource";
import { parseStatus, type MobileStatus } from "./status-api";

/**
 * The shell's status (`GET /api/mobile/status`) for every signed-in screen:
 * the header bell and the banners read it from here, so one request serves
 * them all. It reloads whenever transactions or accounts change (a save, a
 * realtime sync landing), never on a timer. While it loads, or if it fails,
 * the shell shows no bell count and no banners: the screens' own data states
 * carry any failure, so a status hiccup never blocks a screen.
 */
const StatusContext = createContext<MobileStatus | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const tx = useVersion("transactions");
  const accounts = useVersion("accounts");
  const { state } = useResource(`status:${tx}:${accounts}`, (session) =>
    loadResource(() => authFetch("/api/mobile/status", session), parseStatus),
  );
  // A reload keeps the last answer on screen (no bell flicker); a failed first load shows nothing.
  const [last, setLast] = useState<MobileStatus | null>(null);
  useEffect(() => {
    if (state.status === "ready") setLast(state.data);
  }, [state]);
  return <StatusContext.Provider value={last}>{children}</StatusContext.Provider>;
}

/** The latest status, or null before the first answer (or after a failed one). */
export function useStatus(): MobileStatus | null {
  return useContext(StatusContext);
}

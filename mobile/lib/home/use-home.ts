import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import { loadHome, type HomeState } from "./load-home";

/**
 * Loads the Home view-model from `GET /api/mobile/home` with the current
 * Supabase session's Bearer token. The initial load shows `loading`; a
 * pull-to-refresh that fails keeps the numbers already on screen and reports a
 * `notice` instead of blanking them.
 */
export function useHome() {
  const { session } = useAuth();
  const [state, setState] = useState<HomeState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Token refreshes swap the session object; the loader must not re-run (and
  // flash `loading`) every time that happens, so read it through a ref.
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

  const fetchHome = useCallback(() => loadHome(() => authFetch("/api/mobile/home", sessionRef.current)), []);

  const load = useCallback(async () => {
    setNotice(null);
    setState({ status: "loading" });
    const next = await fetchHome();
    if (alive.current) setState(next);
  }, [fetchHome]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next = await fetchHome();
    if (!alive.current) return;
    if (next.status === "ready") {
      setNotice(null);
      setState(next);
    } else {
      // Keep whatever is on screen if we already have numbers.
      setState((prev) => (prev.status === "ready" ? prev : next));
      setNotice(next.message);
    }
    setRefreshing(false);
  }, [fetchHome]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, refreshing, notice, refresh, retry: load };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../auth/auth-context";
import type { LoadState } from "./load";

type Settled<T> = Exclude<LoadState<T>, { status: "loading" }>;

/**
 * Loads one GET resource for a screen (`loadResource` under the hood) and keeps it fresh: it reloads in place when `key`
 * changes (put the month, filters and `useVersion(...)` in the key), a pull-to-refresh that fails keeps the data already on screen and reports a
 * `notice` instead of blanking it, and a slow response for an old key can never overwrite a newer one.
 */
export function useResource<T>(key: string, fetcher: (session: Session | null) => Promise<Settled<T>>) {
  const { session } = useAuth();

  // Token refreshes swap the session object; the loader must not re-run (and flash `loading`) every time, so read it via a ref.
  const sessionRef = useRef(session);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    sessionRef.current = session;
    fetcherRef.current = fetcher;
  });

  const alive = useRef(true);
  const seq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A new key (a month, a filter, a version bump after a save or a realtime event) reloads in place: what is on screen
  // stays until the answer arrives, as the web keeps a page up while it re-renders. Only the first load, or a retry
  // after a failure, shows the loading state. A failed reload replaces the old data: never another key's numbers.
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setNotice(null);
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    const next = await fetcherRef.current(sessionRef.current);
    if (alive.current && mine === seq.current) setState(next);
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setRefreshing(true);
    const next = await fetcherRef.current(sessionRef.current);
    if (!alive.current || mine !== seq.current) return;
    if (next.status === "ready") {
      setNotice(null);
      setState(next);
    } else {
      setState((prev) => (prev.status === "ready" ? prev : next));
      setNotice(next.message);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [key, load]);

  return { state, refreshing, notice, reload: load, refresh };
}

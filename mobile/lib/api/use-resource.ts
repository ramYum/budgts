import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../auth/auth-context";
import type { LoadState } from "./load";

type Settled<T> = Exclude<LoadState<T>, { status: "loading" }>;

/**
 * Loads one GET resource for a screen (`loadResource` under the hood) and keeps it fresh. Two kinds of change, as the
 * web has them:
 * - `key` is WHICH resource (the month, a filter): a new key is a new page, so it shows the loading state while it
 *   loads, as the web's navigation shows its loading page. Otherwise a month tap feels dead on a slow network.
 * - `options.version` is the SAME resource refreshed (`useVersion(...)` after a save, a realtime event): it reloads in
 *   place, what is on screen stays until the answer arrives, as the web keeps a page up while it re-renders.
 * A failed reload replaces the old data (never another key's numbers); a pull-to-refresh that fails keeps the data
 * already on screen and reports a `notice` instead. A slow response for an old key or version never overwrites a newer one.
 */
export function useResource<T>(
  key: string,
  fetcher: (session: Session | null) => Promise<Settled<T>>,
  options: { version?: string | number } = {},
) {
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

  /** Loads the resource: `inPlace` keeps ready data on screen until the answer arrives (a version bump). */
  const fetchInto = useCallback(async (inPlace: boolean) => {
    const mine = ++seq.current;
    setNotice(null);
    setState((prev) => (inPlace && prev.status === "ready" ? prev : { status: "loading" }));
    const next = await fetcherRef.current(sessionRef.current);
    if (alive.current && mine === seq.current) setState(next);
  }, []);
  /** The first load, a new key, or Try again: the loading state until it answers. */
  const load = useCallback(() => fetchInto(false), [fetchInto]);

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

  // A new key is a new page (loading state); a new version of the same key refreshes in place.
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const sameResource = lastKey.current === key;
    lastKey.current = key;
    void fetchInto(sameResource);
  }, [key, options.version, fetchInto]);

  return { state, refreshing, notice, reload: load, refresh };
}

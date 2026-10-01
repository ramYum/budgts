import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../auth/auth-context";
import type { LoadState } from "./load";

type Settled<T> = Exclude<LoadState<T>, { status: "loading" }>;

/**
 * How a load was asked for:
 * - `load`: the first load, a new key, or Try again. It shows the loading state until it answers, as the web's navigation
 *   shows its loading page; a failure is the screen's failure state.
 * - `silent`: a version bump for the SAME resource (a save, a realtime event, `invalidate`). It reloads in place with no
 *   indicator; a failure keeps the figures on screen and sets `notice` (the screen offers a retry).
 * - `pull`: the user's own pull to refresh. The same as `silent`, plus `refreshing` while it runs. `refreshing` is ONLY
 *   ever the user's pull.
 */
type Mode = "load" | "silent" | "pull";

/**
 * Loads one GET resource for a screen (`loadResource` under the hood) and keeps it fresh. Two kinds of change, as the
 * web has them:
 * - `key` is WHICH resource (the month, a filter): a new key is a new page, so it shows the loading state while it
 *   loads, as the web's navigation shows its loading page. Otherwise a month tap feels dead on a slow network.
 * - `options.version` is the SAME resource refreshed (`useVersion(...)` after a save, a realtime event): it reloads in
 *   place and silently, what is on screen stays until the answer arrives, as the web keeps a page up while it re-renders.
 * The project-wide pull contract: a reload of the same resource that fails (a version bump or the user's pull) keeps the
 * figures already on screen and reports a `notice` with a retry; only a new key or Try again can show the failure state,
 * so another key's numbers never stand in for this one's. A slow response for an old key or version never overwrites a
 * newer one, and `refreshing` always ends when the user's pull does, even when a newer request won.
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
  const pulls = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // what is on screen now: a failed reload only adds a notice over figures still shown, never over the failure state
  const shown = useRef(state);
  useEffect(() => {
    shown.current = state;
  });

  const fetchInto = useCallback(async (mode: Mode) => {
    const mine = ++seq.current;
    const pull = mode === "pull" ? ++pulls.current : null;
    if (mode === "load") {
      setNotice(null);
      setState({ status: "loading" });
    }
    if (pull !== null) setRefreshing(true);
    try {
      const next = await fetcherRef.current(sessionRef.current);
      if (!alive.current || mine !== seq.current) return;
      if (next.status === "ready") {
        setNotice(null);
        setState(next);
      } else if (mode === "load") {
        setState(next);
      } else {
        setState((prev) => (prev.status === "ready" ? prev : next));
        // one warning for one failure: the failure state already says it when nothing was on screen
        setNotice(shown.current.status === "ready" ? next.message : null);
      }
    } finally {
      // the latest pull is over, whether its answer landed or a newer request won
      if (alive.current && pull !== null && pull === pulls.current) setRefreshing(false);
    }
  }, []);
  /** The first load, a new key, or Try again: the loading state until it answers. */
  const load = useCallback(() => fetchInto("load"), [fetchInto]);
  /** The user's pull to refresh. */
  const refresh = useCallback(() => fetchInto("pull"), [fetchInto]);

  // A new key is a new page (loading state); a new version of the same key refreshes in place, silently.
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const sameResource = lastKey.current === key;
    lastKey.current = key;
    void fetchInto(sameResource ? "silent" : "load");
  }, [key, options.version, fetchInto]);

  return { state, refreshing, notice, reload: load, refresh };
}

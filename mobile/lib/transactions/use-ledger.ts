import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import { useVersion } from "../api/invalidate";
import { loadResource } from "../api/load";
import { LEDGER_PAGE, loadLedger, type FetchPage, type LedgerProgress } from "./ledger";
import { parseTransactionsPage, transactionsPath } from "./transactions-api";

export type LedgerState = { status: "loading" } | LedgerProgress;

/**
 * The Activity screen's month (`loadLedger`): every row of the month, the first page showing while the rest arrive. A new
 * month or category starts over (the list's skeleton); a change to the transactions topic (a save, a sync heard through
 * Realtime) and pull to refresh re-read quietly, keeping the list on screen until the fresh month is complete, and a
 * failed refresh keeps it and says so. A later page that fails keeps the rows already shown and can be resumed.
 */
export function useLedger(query: { month: string; category: string | null }) {
  const { session } = useAuth();
  const version = useVersion("transactions");

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  const alive = useRef(true);
  const seq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [state, setState] = useState<LedgerState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { month, category } = query;
  const fetchPage = useCallback<FetchPage>(
    (cursor) =>
      loadResource(
        () => authFetch(transactionsPath({ month, category, cursor, limit: LEDGER_PAGE }), sessionRef.current),
        parseTransactionsPage,
      ),
    [month, category],
  );

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setNotice(null);
    setRefreshing(false);
    setState({ status: "loading" });
    const isCurrent = () => alive.current && mine === seq.current;
    await loadLedger(fetchPage, { isCurrent, onProgress: (p) => isCurrent() && setState(p) });
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setRefreshing(true);
    const isCurrent = () => alive.current && mine === seq.current;
    const out = await loadLedger(fetchPage, { isCurrent });
    if (!out || !isCurrent()) return;
    if (out.status === "ready" && out.restError === null) {
      setNotice(null);
      setState(out);
    } else {
      const message = out.status === "error" ? out.message : out.restError!;
      setState((prev) => (prev.status === "ready" ? prev : out));
      setNotice(message);
    }
    setRefreshing(false);
  }, [fetchPage]);

  /** Resumes a month whose later page failed, from where it stopped. */
  const retryRest = useCallback(async () => {
    const current = state;
    if (current.status !== "ready" || current.cursor === null) return;
    const mine = ++seq.current;
    const isCurrent = () => alive.current && mine === seq.current;
    setState({ ...current, restError: null });
    await loadLedger(fetchPage, {
      from: { page: current.page, cursor: current.cursor },
      isCurrent,
      onProgress: (p) => isCurrent() && setState(p),
    });
  }, [fetchPage, state]);

  // A new month or category starts over.
  useEffect(() => {
    void load();
  }, [load]);

  // A change to the transactions topic re-reads quietly (the first render's version is already covered by the load).
  const seenVersion = useRef(version);
  useEffect(() => {
    if (seenVersion.current === version) return;
    seenVersion.current = version;
    void refresh();
  }, [version, refresh]);

  return { state, refreshing, notice, reload: load, refresh, retryRest };
}

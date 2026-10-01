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
  const [notice, setNotice] = useState<string | null>(null);
  /** the month was already started over once for a refused cursor: a second refusal is shown, never looped */
  const restarted = useRef(false);

  const { month, category } = query;
  const fetchPage = useCallback<FetchPage>(
    (cursor) =>
      loadResource(
        () => authFetch(transactionsPath({ month, category, cursor, limit: LEDGER_PAGE }), sessionRef.current),
        parseTransactionsPage,
      ),
    [month, category],
  );

  // `load` and the restart refer to each other; the ref breaks the cycle
  const loadRef = useRef<(restart: boolean) => Promise<void>>(async () => {});

  /** Shows a run's progress; a later page refused as a cursor starts the month over, once. */
  const progress = useCallback((isCurrent: () => boolean) => (p: LedgerProgress) => {
    if (!isCurrent()) return;
    if (p.status === "ready" && p.restKind === "rejected" && !restarted.current) {
      void loadRef.current(true);
      return;
    }
    setState(p);
  }, []);

  const load = useCallback(
    async (restart = false) => {
      restarted.current = restart;
      const mine = ++seq.current;
      setNotice(null);
      setState({ status: "loading" });
      const isCurrent = () => alive.current && mine === seq.current;
      await loadLedger(fetchPage, { isCurrent, onProgress: progress(isCurrent) });
    },
    [fetchPage, progress],
  );
  useEffect(() => {
    loadRef.current = load;
  });

  /**
   * Re-reads quietly (a save, a sync, a pull): the list stays until the fresh month is complete. A failure keeps what is on
   * screen and says why; if the rest of the month was still arriving, that rest is marked failed so Try again appears
   * (never a footer loading forever).
   */
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const isCurrent = () => alive.current && mine === seq.current;
    const out = await loadLedger(fetchPage, { isCurrent });
    if (!out || !isCurrent()) return;
    if (out.status === "ready" && out.restError === null) {
      setNotice(null);
      setState(out);
      return;
    }
    const message = out.status === "error" ? out.message : out.restError!;
    setState((prev) => {
      if (prev.status !== "ready") return out;
      return prev.cursor !== null && prev.restError === null ? { ...prev, restError: message } : prev;
    });
    setNotice(message);
  }, [fetchPage]);

  /** Resumes a month whose later page failed, from where it stopped. */
  const retryRest = useCallback(async () => {
    const current = state;
    if (current.status !== "ready" || current.cursor === null) return;
    const mine = ++seq.current;
    const isCurrent = () => alive.current && mine === seq.current;
    setState({ ...current, restError: null, restKind: undefined });
    await loadLedger(fetchPage, { from: { page: current.page, cursor: current.cursor }, isCurrent, onProgress: progress(isCurrent) });
  }, [fetchPage, progress, state]);

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

  return { state, notice, reload: () => load(), refresh, retryRest };
}

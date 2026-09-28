import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import { useVersion } from "../api/invalidate";
import { loadResource } from "../api/load";
import { mergePages, parseTransactionsPage, transactionsPath, type TransactionsPage, type TransactionsQuery } from "./transactions-api";

const PAGE_SIZE = 30;

export type TransactionListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; page: TransactionsPage; loadingMore: boolean; moreError: string | null };

/**
 * The month's ledger for the Activity screen: first page on load, further pages on `loadMore` (keyset cursor), a full reload
 * whenever the month, filters or the transactions topic change (`useVersion`), and a pull-to-refresh that never blanks a list that
 * is already showing. A failure to load MORE keeps what is on screen and says so.
 */
export function useTransactionList(query: Pick<TransactionsQuery, "month" | "category" | "search">) {
  const { session } = useAuth();
  const version = useVersion("transactions");
  const key = `${query.month}|${query.category ?? ""}|${query.search ?? ""}|${version}`;

  const sessionRef = useRef(session);
  const queryRef = useRef(query);
  useEffect(() => {
    sessionRef.current = session;
    queryRef.current = query;
  });

  const alive = useRef(true);
  const seq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [state, setState] = useState<TransactionListState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchFirst = useCallback(
    () => loadResource(() => authFetch(transactionsPath({ ...queryRef.current, limit: PAGE_SIZE }), sessionRef.current), parseTransactionsPage),
    [],
  );

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setNotice(null);
    setState({ status: "loading" });
    const r = await fetchFirst();
    if (!alive.current || mine !== seq.current) return;
    setState(r.status === "ready" ? { status: "ready", page: r.data, loadingMore: false, moreError: null } : { status: "error", message: r.message });
  }, [fetchFirst]);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setRefreshing(true);
    const r = await fetchFirst();
    if (!alive.current || mine !== seq.current) return;
    if (r.status === "ready") {
      setNotice(null);
      setState({ status: "ready", page: r.data, loadingMore: false, moreError: null });
    } else {
      setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: r.message }));
      setNotice(r.message);
    }
    setRefreshing(false);
  }, [fetchFirst]);

  const loadMore = useCallback(async () => {
    const current = state;
    if (current.status !== "ready" || current.loadingMore || !current.page.nextCursor) return;
    const mine = seq.current;
    setState({ ...current, loadingMore: true, moreError: null });
    const r = await loadResource(
      () => authFetch(transactionsPath({ ...queryRef.current, cursor: current.page.nextCursor, limit: PAGE_SIZE }), sessionRef.current),
      parseTransactionsPage,
    );
    if (!alive.current || mine !== seq.current) return;
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      return r.status === "ready"
        ? { status: "ready", page: mergePages(prev.page, r.data), loadingMore: false, moreError: null }
        : { ...prev, loadingMore: false, moreError: r.message };
    });
  }, [state]);

  useEffect(() => {
    void load();
  }, [key, load]);

  return { state, refreshing, notice, reload: load, refresh, loadMore };
}

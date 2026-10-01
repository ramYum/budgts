import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { authFetch } from "../auth/api";
import { loadResource } from "../api/load";
import { useVersion } from "../api/invalidate";
import { useResource } from "../api/use-resource";
import { parseHub, type MobileHub } from "./status-api";

/**
 * The More and Settings hubs' counts (`GET /api/mobile/hub`). They are quiet
 * summaries beside each row: until they arrive, or if they fail, the rows show
 * no value and stay usable, as the web's rows are links first.
 */
export function useHub(): MobileHub | null {
  // every topic a count moves with: goals, accounts and banks, categories (their writes invalidate transactions),
  // budgets
  const goals = useVersion("goals");
  const accounts = useVersion("accounts");
  const transactions = useVersion("transactions");
  const budgets = useVersion("budgets");
  // Fresh on every visit, as the web renders them per request: a return to More or Settings (a navigation event, not
  // a timer) re-reads them in place, so a change made on another device shows. Not on the first mount: that's the load.
  const [visit, setVisit] = useState(0);
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      setVisit((v) => v + 1);
    }, []),
  );
  const { state } = useResource(
    "hub",
    (session) => loadResource(() => authFetch("/api/mobile/hub", session), parseHub),
    { version: `${goals}:${accounts}:${transactions}:${budgets}:${visit}` },
  );
  return state.status === "ready" ? state.data : null;
}

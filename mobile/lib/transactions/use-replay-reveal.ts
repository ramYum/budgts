import { useCallback, useEffect, useRef, useState } from "react";
import { revealAfterSave } from "./activity-view";
import type { MobileTransaction } from "./transactions-api";
import type { LedgerState } from "./use-ledger";

/**
 * After a create the server answered `replayed: true` (its request id had already landed, so the values sent this time
 * were not applied), the kept row is opened as soon as the refreshed month shows it, so the person sees what was saved.
 * Kept in another month, or the refresh that would show it failed (a new `notice`): `onAnotherMonth` says so (Activity's
 * saved notice) instead of dropping the fact. Either way, and when another sheet opens (`cancel`), the reveal ends, so the
 * row can never pop up later out of the blue.
 */
export function useReplayReveal({
  ledger,
  notice,
  onOpen,
  onAnotherMonth,
}: {
  ledger: LedgerState;
  notice: string | null;
  onOpen: (row: MobileTransaction) => void;
  onAnotherMonth: () => void;
}) {
  const [pending, setPending] = useState<{ id: string; since: unknown; notice: string | null } | null>(null);
  const callbacks = useRef({ onOpen, onAnotherMonth });
  useEffect(() => {
    callbacks.current = { onOpen, onAnotherMonth };
  });

  useEffect(() => {
    if (!pending) return;
    if (notice !== null && notice !== pending.notice) {
      // the refresh failed: the moment to open the row has passed, but "already saved" still has to be said
      setPending(null);
      callbacks.current.onAnotherMonth();
      return;
    }
    const next = revealAfterSave(ledger, pending);
    if (next === "wait") return;
    setPending(null);
    if (next === "drop") callbacks.current.onAnotherMonth();
    else callbacks.current.onOpen(next.open);
  }, [ledger, notice, pending]);

  const start = useCallback(
    (id: string) => setPending({ id, since: ledger.status === "ready" ? ledger.page : null, notice }),
    [ledger, notice],
  );
  const cancel = useCallback(() => setPending(null), []);
  return { start, cancel };
}

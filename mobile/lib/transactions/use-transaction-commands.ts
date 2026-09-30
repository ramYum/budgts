import { useMemo, useRef, useEffect } from "react";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import { invalidate } from "../api/invalidate";
import { mutate, type MutationOutcome } from "../api/load";
import { jsonInit } from "../api/request";
import { draftToPayload, type TransactionDraft } from "./form";

/**
 * The transaction commands the Activity sheets send, through the existing endpoints (rules: `src/lib/transactions/commands.ts`):
 * create (`POST /api/mobile/transactions`, with the form's request id so a retry lands once), edit and delete
 * (`PATCH` / `DELETE /api/mobile/transactions/:id`). A success refreshes Activity, Budgets and Home.
 */
export function useTransactionCommands() {
  const { session } = useAuth();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  return useMemo(() => {
    const done = (out: MutationOutcome) => {
      if (out.status === "ok" || out.status === "missing") invalidate("transactions", "budgets", "home");
      return out;
    };
    return {
      create: async (draft: TransactionDraft, requestId: string | undefined) =>
        done(await mutate(() => authFetch("/api/mobile/transactions", sessionRef.current, jsonInit("POST", draftToPayload(draft, requestId))))),
      update: async (id: string, draft: TransactionDraft) =>
        done(await mutate(() => authFetch(`/api/mobile/transactions/${id}`, sessionRef.current, jsonInit("PATCH", draftToPayload(draft))))),
      remove: async (id: string) => done(await mutate(() => authFetch(`/api/mobile/transactions/${id}`, sessionRef.current, { method: "DELETE" }))),
    };
  }, []);
}

export type TransactionCommands = ReturnType<typeof useTransactionCommands>;

import { useMemo, useRef, useEffect } from "react";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import { invalidate } from "../api/invalidate";
import { mutate, type MutationOutcome } from "../api/load";
import { jsonInit } from "../api/request";
import { createBody, writeCategory, type CategoryFields, type CategoryWrite } from "../categories/manage";
import { draftToPayload, type TransactionDraft } from "./form";

/**
 * The transaction commands the Activity sheets send, through the existing endpoints (rules: `src/lib/transactions/commands.ts`):
 * create (`POST /api/mobile/transactions`, with the form's request id so a retry lands once), edit and delete
 * (`PATCH` / `DELETE /api/mobile/transactions/:id`), and the "Needs a category" pick and Re-scan
 * (`POST …/:id/categorize`, `POST …/rescan`). A success refreshes Activity, Budgets, Home and the header bell.
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
      /** "Needs a category": one pick for a merchant group's anchor row; the server fills the merchant's other blank rows. */
      categorize: async (anchorId: string, choice: CategoryChoice) =>
        done(
          await mutate(() =>
            authFetch(
              `/api/mobile/transactions/${anchorId}/categorize`,
              sessionRef.current,
              jsonInit("POST", "categoryId" in choice ? { categoryId: choice.categoryId } : { standardCategoryName: choice.standardCategoryName }),
            ),
          ),
        ),
      /** "Re-scan": the server re-runs its categorization evidence over the still-blank bank rows. */
      rescan: async () => done(await mutate(() => authFetch("/api/mobile/transactions/rescan", sessionRef.current, jsonInit("POST", {})))),
      /** "+ New category…" (the Categories screen's create): one request id per sheet, so a retry lands once. */
      createCategory: async (fields: CategoryFields, requestId: string | undefined): Promise<CategoryWrite> => {
        const out = await writeCategory(() =>
          authFetch("/api/mobile/categories", sessionRef.current, jsonInit("POST", createBody(fields, requestId!))),
        );
        if (out.ok) invalidate("transactions", "budgets", "home");
        return out;
      },
    };
  }, []);
}

/** A picked existing category, or a standard one the user no longer has (restored as it is applied). */
export type CategoryChoice = { categoryId: string } | { standardCategoryName: string };

export type TransactionCommands = ReturnType<typeof useTransactionCommands>;

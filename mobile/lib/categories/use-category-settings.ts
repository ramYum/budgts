import { authFetch } from "../auth/api";
import { invalidate, useVersion } from "../api/invalidate";
import { loadResource } from "../api/load";
import { jsonInit } from "../api/request";
import { useResource } from "../api/use-resource";
import { useAuth } from "../auth/auth-context";
import { createBody, parseCategorySettings, writeCategory, type CategoryFields, type CategoryWrite } from "./manage";

/**
 * Settings → Categories' list (`GET /api/mobile/settings/categories`). Its per-category counts are this month's
 * transactions, and a category write invalidates transactions too, so it re-reads whenever they change.
 */
export function useCategorySettings() {
  const transactions = useVersion("transactions");
  return useResource(
    "category-settings",
    (session) => loadResource(() => authFetch("/api/mobile/settings/categories", session), parseCategorySettings),
    { version: transactions },
  );
}

/**
 * The Categories screen's list and its writes. A successful write invalidates what shows category names or counts
 * (transactions, budgets, Home); the transactions bump re-reads this list in place, once. `refreshing` stays the
 * user's pull alone.
 */
export function useCategoriesScreen() {
  const { session } = useAuth();
  const list = useCategorySettings();

  function settle(result: CategoryWrite): CategoryWrite {
    if (result.ok) invalidate("transactions", "budgets", "home");
    return result;
  }

  const writes = {
    create: async (fields: CategoryFields, requestId: string) =>
      settle(await writeCategory(() => authFetch("/api/mobile/categories", session, jsonInit("POST", createBody(fields, requestId))))),
    update: async (id: string, fields: CategoryFields) =>
      settle(await writeCategory(() => authFetch(`/api/mobile/categories/${id}`, session, jsonInit("PATCH", fields)))),
    setArchived: async (id: string, archived: boolean) =>
      settle(await writeCategory(() => authFetch(`/api/mobile/categories/${id}`, session, jsonInit("PATCH", { archived })))),
  };

  return { ...list, writes };
}

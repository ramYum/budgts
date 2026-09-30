import { authFetch } from "../auth/api";
import { loadResource } from "../api/load";
import { useVersion } from "../api/invalidate";
import { useResource } from "../api/use-resource";
import { parseCategorySettings } from "./manage";

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

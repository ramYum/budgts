import * as Crypto from "expo-crypto";
import { useRouter, type Href } from "expo-router";
import { ScreenSkeleton } from "../../../../../components/feedback/skeleton";
import { LoadFailure } from "../../../../../components/feedback/states";
import { CategoriesView, type CategoryActions } from "../../../../../components/settings/categories-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";
import { invalidate } from "../../../../../lib/api/invalidate";
import { jsonInit } from "../../../../../lib/api/request";
import { authFetch } from "../../../../../lib/auth/api";
import { useAuth } from "../../../../../lib/auth/auth-context";
import { useCategorySettings } from "../../../../../lib/categories/use-category-settings";
import { createBody, writeCategory, type CategoryWrite } from "../../../../../lib/categories/manage";

/** Settings → Categories: the web's /settings/categories (components/settings/categories-view.tsx). */
export default function CategoriesScreen() {
  const router = useRouter();
  const onBack = useBack("/settings");
  const { session, signOut } = useAuth();
  const { state, refreshing, refresh, reload } = useCategorySettings();

  /** After a write: the list re-reads quietly, and every screen showing category names or counts reloads. */
  async function settle(result: CategoryWrite): Promise<CategoryWrite> {
    if (result.ok) {
      invalidate("transactions", "budgets", "home");
      await refresh();
    }
    return result;
  }

  const actions: CategoryActions = {
    create: async (fields, requestId) =>
      settle(await writeCategory(() => authFetch("/api/mobile/categories", session, jsonInit("POST", createBody(fields, requestId))))),
    update: async (id, fields) =>
      settle(await writeCategory(() => authFetch(`/api/mobile/categories/${id}`, session, jsonInit("PATCH", fields)))),
    setArchived: async (id, archived) =>
      settle(await writeCategory(() => authFetch(`/api/mobile/categories/${id}`, session, jsonInit("PATCH", { archived })))),
    newRequestId: () => Crypto.randomUUID(),
    openCategory: (id, month) => router.push(`/activity?m=${month}&category=${id}` as Href),
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      {state.status === "ready" ? (
        <CategoriesView data={state.data} actions={actions} onBack={onBack} />
      ) : state.status === "error" ? (
        <LoadFailure kind={state.kind} onRetry={() => void reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
      ) : (
        <ScreenSkeleton />
      )}
    </Screen>
  );
}

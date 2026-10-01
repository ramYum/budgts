import { useRouter, type Href } from "expo-router";
import { ScreenSkeleton } from "../../../../../components/feedback/skeleton";
import { LoadFailure } from "../../../../../components/feedback/states";
import { CategoriesView, type CategoryActions } from "../../../../../components/settings/categories-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";
import { useAuth } from "../../../../../lib/auth/auth-context";
import { useCategoriesScreen } from "../../../../../lib/categories/use-category-settings";

/** Settings → Categories: the web's /settings/categories (components/settings/categories-view.tsx). */
export default function CategoriesScreen() {
  const router = useRouter();
  const onBack = useBack("/settings");
  const { signOut } = useAuth();
  const { state, notice, refreshing, refresh, reload, writes } = useCategoriesScreen();

  const actions: CategoryActions = {
    ...writes,
    openCategory: (id, month) => router.push(`/activity?m=${month}&category=${id}` as Href),
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()} name="categories" notice={notice} onRetry={() => void refresh()}>
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

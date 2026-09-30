import { useEffect, useMemo, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityView } from "../../../../components/activity/activity-view";
import { Screen } from "../../../../components/shell/screen";
import { authFetch } from "../../../../lib/auth/api";
import { useVersion } from "../../../../lib/api/invalidate";
import { loadResource } from "../../../../lib/api/load";
import { useResource } from "../../../../lib/api/use-resource";
import { parseCategories } from "../../../../lib/categories/categories-api";
import { useProfile, useUserDates } from "../../../../lib/profile/profile-context";
import { parseActivityExtras } from "../../../../lib/transactions/activity-api";
import { draftFromTransaction } from "../../../../lib/transactions/form";
import type { MobileTransaction } from "../../../../lib/transactions/transactions-api";
import { useLedger } from "../../../../lib/transactions/use-ledger";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Activity: the web's /transactions (components/activity/activity-view.tsx). The month and the category live in the route
 * (`/activity?m=2026-09&category=<id>`, the web's `?m=` and `?category=`), so Home, Budgets, Insights and Categories can
 * open it narrowed. Rows come from `GET /api/mobile/transactions` (every page of the month), the panels from
 * `GET /api/mobile/activity`; the device computes no money.
 */
export default function ActivityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ m?: string; category?: string }>();
  const { month: thisMonth } = useUserDates();
  const { state: profile } = useProfile();
  const currency = profile.status === "ready" ? profile.profile.currency : "USD";

  const month = typeof params.m === "string" && MONTH.test(params.m) ? params.m : thisMonth;
  const categoryId = typeof params.category === "string" && UUID.test(params.category) ? params.category : null;

  const ledger = useLedger({ month, category: categoryId });
  const extras = useResource("activity-extras", (s) => loadResource(() => authFetch("/api/mobile/activity", s), parseActivityExtras));
  const categories = useResource("activity-categories", (s) => loadResource(() => authFetch("/api/mobile/categories", s), parseCategories));

  // A save or a sync (the transactions topic) can change what needs a category and which categories exist: re-read quietly.
  const version = useVersion("transactions");
  const seen = useRef(version);
  const { refresh: refreshExtras } = extras;
  const { refresh: refreshCategories } = categories;
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    void refreshExtras();
    void refreshCategories();
  }, [version, refreshExtras, refreshCategories]);

  const cats = categories.state.status === "ready" ? categories.state.data : null;
  const kinds = useMemo(() => new Map((cats ?? []).map((c) => [c.id, c.kind] as const)), [cats]);
  const category = categoryId ? { id: categoryId, name: cats?.find((c) => c.id === categoryId)?.name ?? "category" } : null;

  // Add / edit open the existing transaction form until its sheet lands (Lane D2).
  const openEditor = (t?: MobileTransaction) =>
    router.push(t ? { pathname: "/transaction", params: { id: t.id, draft: JSON.stringify(draftFromTransaction(t)) } } : "/transaction");

  return (
    <Screen
      refreshing={ledger.refreshing}
      onRefresh={() => {
        void ledger.refresh();
        void extras.refresh();
        void categories.refresh();
      }}
    >
      <ActivityView
        month={month}
        onMonth={(m) => router.setParams({ m })}
        currency={currency}
        category={category}
        onClearCategory={() => router.setParams({ category: undefined })}
        ledger={ledger.state}
        notice={ledger.notice ?? extras.notice}
        onRetry={() => void ledger.reload()}
        onRetryRest={() => void ledger.retryRest()}
        extras={extras.state}
        onRetryExtras={() => void extras.reload()}
        kinds={kinds}
        onAdd={() => openEditor()}
        onOpen={openEditor}
        onConnectBank={() => router.push("/connected-banks")}
      />
    </Screen>
  );
}

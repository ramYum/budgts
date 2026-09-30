import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityView } from "../../../../components/activity/activity-view";
import { transferToggleDraft } from "../../../../components/activity/transaction-form";
import { AddTransactionSheet, EditTransactionSheet, TransactionDetailSheet } from "../../../../components/activity/transaction-sheets";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { LoadFailure } from "../../../../components/feedback/states";
import { Screen } from "../../../../components/shell/screen";
import { parseAccounts } from "../../../../lib/accounts/accounts-api";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { useVersion } from "../../../../lib/api/invalidate";
import { loadResource } from "../../../../lib/api/load";
import { useResource } from "../../../../lib/api/use-resource";
import { parseCategories } from "../../../../lib/categories/categories-api";
import { useProfile, useUserDates } from "../../../../lib/profile/profile-context";
import { parseActivityExtras } from "../../../../lib/transactions/activity-api";
import type { MobileTransaction } from "../../../../lib/transactions/transactions-api";
import { useLedger } from "../../../../lib/transactions/use-ledger";
import { useTransactionCommands } from "../../../../lib/transactions/use-transaction-commands";

type Sheet = { kind: "view"; t: MobileTransaction } | { kind: "edit"; t: MobileTransaction } | { kind: "add" } | null;

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
  const { signOut } = useAuth();
  const { month: thisMonth, today } = useUserDates();
  const { state: profile } = useProfile();
  const currency = profile.status === "ready" ? profile.profile.currency : "USD";

  const month = typeof params.m === "string" && MONTH.test(params.m) ? params.m : thisMonth;
  const categoryId = typeof params.category === "string" && UUID.test(params.category) ? params.category : null;

  const ledger = useLedger({ month, category: categoryId });
  const extras = useResource("activity-extras", (s) => loadResource(() => authFetch("/api/mobile/activity", s), parseActivityExtras));
  const categories = useResource("activity-categories", (s) => loadResource(() => authFetch("/api/mobile/categories", s), parseCategories));
  const accountsVersion = useVersion("accounts");
  const accounts = useResource(`activity-accounts|${accountsVersion}`, (s) => loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts));
  const commands = useTransactionCommands();
  const [sheet, setSheet] = useState<Sheet>(null);

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

  // The web's rule for a new entry's date: today in the current month, else the shown month's 15th.
  const defaultDate = month === thisMonth ? today : `${month}-15`;
  const formData = {
    accounts: accounts.state,
    categories: categories.state,
    onRetry: () => {
      void accounts.reload();
      void categories.reload();
    },
  };

  const sheets =
    sheet?.kind === "view" ? (
      <TransactionDetailSheet
        transaction={sheet.t}
        currency={currency}
        onClose={() => setSheet(null)}
        onEdit={(t) => setSheet({ kind: "edit", t })}
        onToggleTransfer={(t) => commands.update(t.id, transferToggleDraft(t))}
      />
    ) : sheet?.kind === "edit" ? (
      <EditTransactionSheet transaction={sheet.t} data={formData} commands={commands} onClose={() => setSheet(null)} />
    ) : sheet?.kind === "add" ? (
      <AddTransactionSheet data={formData} defaultDate={defaultDate} commands={commands} onClose={() => setSheet(null)} />
    ) : null;

  // The web's one loading shape while the month loads, and its error / offline screens when it can't.
  if (ledger.state.status === "loading" || ledger.state.status === "error") {
    return (
      <Screen>
        {ledger.state.status === "loading" ? (
          <ScreenSkeleton />
        ) : (
          <LoadFailure kind={ledger.state.kind} onRetry={() => void ledger.reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
        )}
      </Screen>
    );
  }

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
        onRetryRest={() => void ledger.retryRest()}
        extras={extras.state}
        onRetryExtras={() => void extras.reload()}
        kinds={kinds}
        categories={cats ?? []}
        onCategorize={commands.categorize}
        onRescan={commands.rescan}
        onAdd={() => setSheet({ kind: "add" })}
        onOpen={(t) => setSheet({ kind: "view", t })}
      />
      {sheets}
    </Screen>
  );
}

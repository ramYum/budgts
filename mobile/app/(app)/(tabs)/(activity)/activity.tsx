import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityView } from "../../../../components/activity/activity-view";
import { transferToggleDraft } from "../../../../components/activity/transaction-form";
import { ALREADY_SAVED, AddTransactionSheet, EditTransactionSheet, TransactionDetailSheet } from "../../../../components/activity/transaction-sheets";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { LoadFailure } from "../../../../components/feedback/states";
import { Screen } from "../../../../components/shell/screen";
import { parseAccounts } from "../../../../lib/accounts/accounts-api";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { useVersion } from "../../../../lib/api/invalidate";
import { loadResource } from "../../../../lib/api/load";
import { useResource } from "../../../../lib/api/use-resource";
import { useProfile, useUserDates } from "../../../../lib/profile/profile-context";
import { newRequestId } from "../../../../lib/transactions/form";
import type { MobileTransaction } from "../../../../lib/transactions/transactions-api";
import { useLedger } from "../../../../lib/transactions/use-ledger";
import { useActivityPanels } from "../../../../lib/transactions/use-activity-panels";
import { useReplayReveal } from "../../../../lib/transactions/use-replay-reveal";
import { useTransactionCommands } from "../../../../lib/transactions/use-transaction-commands";

type Sheet = { kind: "view"; t: MobileTransaction; alreadySaved?: boolean } | { kind: "edit"; t: MobileTransaction } | { kind: "add" } | null;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Activity: the web's /transactions (components/activity/activity-view.tsx). The month and the category live in the route
 * (`/activity?m=2026-09&category=<id>`, the web's `?m=` and `?category=`), so Home, Budgets, Insights and Categories can
 * open it narrowed; the header bell adds `focus=needs-category` (the web's `#needs-category`). Rows come from `GET /api/mobile/transactions` (every page of the month), the panels from
 * `GET /api/mobile/activity`; the device computes no money.
 */
export default function ActivityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ m?: string; category?: string; focus?: string }>();
  const { signOut } = useAuth();
  const { month: thisMonth, today } = useUserDates();
  const { state: profile } = useProfile();
  const currency = profile.status === "ready" ? profile.profile.currency : "USD";

  const month = typeof params.m === "string" && MONTH.test(params.m) ? params.m : thisMonth;
  const categoryId = typeof params.category === "string" && UUID.test(params.category) ? params.category : null;

  const ledger = useLedger({ month, category: categoryId });
  const { extras, categories } = useActivityPanels();
  const accountsVersion = useVersion("accounts");
  const accounts = useResource("activity-accounts", (s) => loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts), {
    version: accountsVersion,
  });
  const commands = useTransactionCommands();
  const [sheet, setSheet] = useState<Sheet>(null);
  /** the pull-to-refresh spinner: only a pull shows it, never a save or a sync refreshing in the background */
  const [pulling, setPulling] = useState(false);
  /** a replayed create kept in another month: said on Activity until dismissed */
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const cats = categories.state.status === "ready" ? categories.state.data : null;
  const kinds = useMemo(() => new Map((cats ?? []).map((c) => [c.id, c.kind] as const)), [cats]);
  // the name once the categories are in (the web's "category" when it isn't one of them); null while they load
  const category = categoryId
    ? { id: categoryId, name: categories.state.status === "loading" ? null : (cats?.find((c) => c.id === categoryId)?.name ?? "category") }
    : null;

  // A create the server answered replayed: open the row it kept, with what happened; in another month, say so here.
  const reveal = useReplayReveal({
    ledger: ledger.state,
    notice: ledger.notice,
    onOpen: (t) => setSheet({ kind: "view", t, alreadySaved: true }),
    onAnotherMonth: () => setSavedNotice(ALREADY_SAVED),
  });
  /** any other sheet opening ends a pending reveal (it must never pop up later) */
  const openSheet = (next: Sheet) => {
    reveal.cancel();
    setSheet(next);
  };

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
        alreadySaved={sheet.alreadySaved}
        currency={currency}
        onClose={() => setSheet(null)}
        onEdit={(t) => setSheet({ kind: "edit", t })}
        onToggleTransfer={(t) => commands.update(t.id, transferToggleDraft(t))}
      />
    ) : sheet?.kind === "edit" ? (
      <EditTransactionSheet transaction={sheet.t} data={formData} commands={commands} onClose={() => setSheet(null)} />
    ) : sheet?.kind === "add" ? (
      <AddTransactionSheet
        data={formData}
        defaultDate={defaultDate}
        commands={commands}
        onClose={(saved) => {
          setSheet(null);
          if (saved?.replayed && saved.id) reveal.start(saved.id);
        }}
      />
    ) : null;

  /** The user's refresh (a pull, or the stale notice's Refresh): the month and both panels, the spinner until all settle. */
  const refreshAll = () => {
    setPulling(true);
    void Promise.all([ledger.refresh(), extras.refresh(), categories.refresh()]).finally(() => setPulling(false));
  };

  // The web's one loading shape while the month loads, and its error / offline screens when it can't.
  const ready = ledger.state.status === "ready";
  return (
    <Screen
      refreshing={pulling}
      onRefresh={ready ? refreshAll : undefined}
      name="activity"
      // any read that failed to refresh (silently after a save or sync, or on a pull) says so, never stale figures as fresh
      notice={ready ? (ledger.notice ?? extras.notice ?? categories.notice) : null}
      onRetry={refreshAll}
    >
      {ledger.state.status === "loading" ? (
        <ScreenSkeleton />
      ) : ledger.state.status === "error" ? (
        <LoadFailure kind={ledger.state.kind} onRetry={() => void ledger.reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
      ) : (
        <>
          <ActivityView
            month={month}
            onMonth={(m) => router.setParams({ m })}
            currency={currency}
            category={category}
            onClearCategory={() => router.setParams({ category: undefined })}
            focus={params.focus ?? null}
            onFocused={() => router.setParams({ focus: undefined })}
            ledger={ledger.state}
            onRetryRest={() => void ledger.retryRest()}
            extras={extras.state}
            onRetryExtras={() => void extras.reload()}
            kinds={kinds}
            categories={cats ?? []}
            onCategorize={commands.categorize}
            onRescan={commands.rescan}
            onCreateCategory={commands.createCategory}
            newRequestId={newRequestId}
            onAdd={() => openSheet({ kind: "add" })}
            onOpen={(t) => openSheet({ kind: "view", t })}
            savedNotice={savedNotice}
            onDismissSavedNotice={() => setSavedNotice(null)}
          />
          {sheets}
        </>
      )}
    </Screen>
  );
}

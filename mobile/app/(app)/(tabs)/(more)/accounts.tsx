import { useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { AccountsView } from "../../../../components/banks/accounts-view";
import { LoadFailure } from "../../../../components/feedback/states";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { Screen } from "../../../../components/shell/screen";
import { parseAccounts } from "../../../../lib/accounts/accounts-api";
import { accountCommands, parseOverview } from "../../../../lib/accounts/overview-api";
import { useVersion } from "../../../../lib/api/invalidate";
import { loadResource } from "../../../../lib/api/load";
import { useResource } from "../../../../lib/api/use-resource";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";

/**
 * Accounts: the web's /accounts (components/banks/accounts-view.tsx) over `GET /api/mobile/accounts/overview` (the
 * groups and this month's counts) and `GET /api/mobile/accounts` (the server's account types for the form). A save
 * invalidates "accounts", which reloads this screen in place.
 */
async function loadAccountsScreen(s: Session | null) {
  const [overview, accounts] = await Promise.all([
    loadResource(() => authFetch("/api/mobile/accounts/overview", s), parseOverview),
    loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts),
  ]);
  if (overview.status === "error") return overview;
  if (accounts.status === "error") return accounts;
  return { status: "ready" as const, data: { overview: overview.data, accountTypes: accounts.data.accountTypes } };
}

export default function AccountsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  // A change to the user's accounts anywhere (a save here, a bank connected from the welcome guide, realtime) reloads
  // in place and silently; `refreshing` is only the user's own pull.
  const version = useVersion("accounts");
  const { state, notice, refresh, refreshing, reload } = useResource("accounts-overview", loadAccountsScreen, { version });

  const commands = useMemo(() => accountCommands(session), [session]);

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      {state.status === "loading" ? (
        <ScreenSkeleton />
      ) : state.status === "error" ? (
        <LoadFailure kind={state.kind} onRetry={() => void reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
      ) : (
        <AccountsView
          overview={state.data.overview}
          accountTypes={state.data.accountTypes}
          commands={commands}
          onBack={() => (router.canGoBack() ? router.back() : router.navigate("/more"))}
          notice={notice}
          onRetry={() => void refresh()}
        />
      )}
    </Screen>
  );
}

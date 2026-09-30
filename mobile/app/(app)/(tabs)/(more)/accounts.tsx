import { useEffect, useMemo, useRef } from "react";
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
export default function AccountsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { state, refresh, refreshing, reload } = useResource("accounts-overview", async (s) => {
    const [overview, accounts] = await Promise.all([
      loadResource(() => authFetch("/api/mobile/accounts/overview", s), parseOverview),
      loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts),
    ]);
    if (overview.status === "error") return overview;
    if (accounts.status === "error") return accounts;
    return { status: "ready" as const, data: { overview: overview.data, accountTypes: accounts.data.accountTypes } };
  });

  const version = useVersion("accounts");
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    void refresh();
  }, [version, refresh]);

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
        />
      )}
    </Screen>
  );
}

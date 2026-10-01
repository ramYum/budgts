import { useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { ConnectedBanksView } from "../../../../components/banks/connected-banks-view";
import { LoadFailure } from "../../../../components/feedback/states";
import { ScreenSkeleton } from "../../../../components/feedback/skeleton";
import { Screen } from "../../../../components/shell/screen";
import { parseAccounts } from "../../../../lib/accounts/accounts-api";
import { useVersion } from "../../../../lib/api/invalidate";
import { loadResource } from "../../../../lib/api/load";
import { useResource } from "../../../../lib/api/use-resource";
import { authFetch } from "../../../../lib/auth/api";
import { useAuth } from "../../../../lib/auth/auth-context";
import { bankCommands, linkPorts } from "../../../../lib/plaid/bank-commands";
import { parseBanks } from "../../../../lib/plaid/banks-api";
import { mappingChoices } from "../../../../lib/plaid/mapping";
import { createPlaidLinkClient } from "../../../../lib/plaid/plaid-link-native";

/**
 * Connected banks: the web's /connected-banks (components/banks/connected-banks-view.tsx) over
 * `GET /api/mobile/plaid/banks` and, for the mapping sheet's choices, `GET /api/mobile/accounts`.
 * Every Plaid action invalidates "accounts", which reloads this screen in place (the web's revalidation).
 */
async function loadBanksScreen(s: Session | null) {
  const [banks, accounts] = await Promise.all([
    loadResource(() => authFetch("/api/mobile/plaid/banks", s), parseBanks),
    loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts),
  ]);
  if (banks.status === "error") return banks;
  if (accounts.status === "error") return accounts;
  return { status: "ready" as const, data: { ...banks.data, choices: mappingChoices(accounts.data) } };
}

export default function ConnectedBanksScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  // A change to the user's accounts anywhere (a save here, a bank connected from the welcome guide, realtime) reloads
  // in place and silently; `refreshing` is only the user's own pull.
  const version = useVersion("accounts");
  const { state, notice, refresh, refreshing, reload } = useResource("connected-banks", loadBanksScreen, { version });

  const link = useMemo(() => createPlaidLinkClient(), []);
  const commands = useMemo(() => bankCommands(session), [session]);
  const ports = useMemo(() => linkPorts(session), [session]);

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()} name="connected-banks" notice={notice} onRetry={() => void refresh()}>
      {state.status === "loading" ? (
        <ScreenSkeleton />
      ) : state.status === "error" ? (
        <LoadFailure kind={state.kind} onRetry={() => void reload()} onHome={() => router.navigate("/")} onSignOut={() => void signOut()} />
      ) : (
        <ConnectedBanksView
          enabled={state.data.enabled}
          banks={state.data.banks}
          actions={{ commands, ports, link, choices: state.data.choices }}
          now={Date.now()}
          onBack={() => (router.canGoBack() ? router.back() : router.navigate("/more"))}
        />
      )}
    </Screen>
  );
}

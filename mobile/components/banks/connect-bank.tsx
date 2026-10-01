import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { invalidate, useVersion } from "../../lib/api/invalidate";
import { loadResource } from "../../lib/api/load";
import { parseAccounts } from "../../lib/accounts/accounts-api";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import type { UnmappedAccount } from "../../lib/plaid/banks-api";
import { linkPorts } from "../../lib/plaid/bank-commands";
import { connectBank } from "../../lib/plaid/link-flow";
import { mappingChoices, type MappingChoices } from "../../lib/plaid/mapping";
import type { PlaidLinkClient } from "../../lib/plaid/plaid-link";
import { createPlaidLinkClient, currentPlatform } from "../../lib/plaid/plaid-link-native";
import { Button } from "../brand/controls";
import { Text } from "../brand/text";
import { AccountMappingSheet } from "./account-mapping";

type Phase = "idle" | "starting" | "linking" | "exchanging";
type Mapping = { plaidItemId: string; accounts: UnmappedAccount[]; choices: MappingChoices };

/**
 * "Connect a bank" (web `ConnectBank`, src/components/plaid/connect-bank.tsx):
 * mints a Link token, opens native Plaid Link, exchanges the public token on
 * the server, then opens the mapping sheet. Used by Connected banks and by
 * the welcome guide's bank card. Keep it mounted while its sheet is open: the
 * sheet lives inside it, as on the web.
 */
export function ConnectBank({
  label = "Connect a bank",
  tone = "primary",
  fullWidth = false,
  link = createPlaidLinkClient(),
  testID = "connect-bank",
}: {
  label?: string;
  tone?: "primary" | "outline";
  /** stretch the button to its container (the welcome guide's primary action) */
  fullWidth?: boolean;
  /** the Plaid Link port (tests pass a fake) */
  link?: PlaidLinkClient;
  testID?: string;
}) {
  const { session } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // While the sheet is open, its choices follow the user's accounts: a refusal (or a change elsewhere) reloads them, so
  // a row pointing at an account no longer offered moves off it.
  const version = useVersion("accounts");
  const seen = useRef(version);
  const open = mapping !== null;
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    if (!open) return;
    let alive = true;
    void loadResource(() => authFetch("/api/mobile/accounts", session), parseAccounts).then((loaded) => {
      if (alive && loaded.status === "ready") setMapping((m) => (m ? { ...m, choices: mappingChoices(loaded.data) } : m));
    });
    return () => {
      alive = false;
    };
  }, [version, open, session]);

  const run = useCallback(async () => {
    setError(null);
    setNotice(null);
    setPhase("starting");
    const ports = linkPorts(session);
    const outcome = await connectBank(
      {
        fetchLinkToken: ports.fetchLinkToken,
        link: {
          isAvailable: () => link.isAvailable(),
          open: (token) => {
            setPhase("linking");
            return link.open(token);
          },
        },
        exchange: (publicToken, institution) => {
          setPhase("exchanging");
          return ports.exchange(publicToken, institution);
        },
      },
      currentPlatform(),
    );

    if (outcome.status === "linked") {
      // the sheet offers the user's accounts and the server's account types
      const loaded = await loadResource(() => authFetch("/api/mobile/accounts", session), parseAccounts);
      setPhase("idle");
      if (loaded.status === "ready") {
        setMapping({ plaidItemId: outcome.plaidItemId, accounts: outcome.accounts, choices: mappingChoices(loaded.data) });
      } else {
        // the bank is connected; its accounts wait in Connected banks under "Choose accounts to import"
        invalidate("accounts");
        setNotice("Your bank is connected. Choose which of its accounts to import from Connected banks.");
      }
      return;
    }
    setPhase("idle");
    if (outcome.status === "already_linked") setNotice("You've already connected this bank. Reconnect it from the list below if it needs attention.");
    else if (outcome.status === "unavailable") setError("Bank connections aren't available in this build yet.");
    else if (outcome.status === "error") setError(outcome.message);
  }, [session, link]);

  // One run at a time, decided synchronously: two taps in the same frame both land before the disabled button renders.
  const running = useRef(false);
  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      await run();
    } finally {
      running.current = false;
    }
  }, [run]);

  // Dismissed without mapping: the bank was still created, so the lists reload to show it with its "choose accounts" prompt.
  const cancelMapping = useCallback(() => {
    setMapping(null);
    invalidate("accounts");
  }, []);

  // The web's Link opens over the page at once; native Link can take a while to appear after `open`, so the button
  // stays on "Opening…", disabled, until Link closes (Link covers it once it shows, as on the web).
  const busy = phase !== "idle";

  return (
    <View style={{ gap: 8 }}>
      <Button
        testID={testID}
        variant={tone === "primary" ? "primary" : "secondary"}
        icon="plus"
        onPress={() => void start()}
        loading={busy}
        style={fullWidth ? undefined : { alignSelf: "flex-start" }}
      >
        {phase === "starting" || phase === "linking" ? "Opening…" : phase === "exchanging" ? "Connecting…" : label}
      </Button>

      {error ? (
        <Text testID={`${testID}-error`} variant="small" color={ROLE.neg} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text testID={`${testID}-notice`} variant="small" color={ROLE.muted}>
          {notice}
        </Text>
      ) : null}

      {mapping ? (
        <AccountMappingSheet
          plaidItemId={mapping.plaidItemId}
          plaidAccounts={mapping.accounts}
          choices={mapping.choices}
          onDone={() => setMapping(null)}
          onClose={cancelMapping}
        />
      ) : null}
    </View>
  );
}

import { useState } from "react";
import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { jsonInit } from "../../lib/api/request";
import { connectBank } from "../../lib/plaid/link-flow";
import { createPlaidLinkClient, currentPlatform } from "../../lib/plaid/plaid-link-native";
import { Button } from "../brand/controls";
import { Text } from "../brand/text";

type Phase = "idle" | "starting" | "exchanging";

/**
 * INTERIM (Lane A, until Lane E's `components/banks/connect-bank.tsx` lands with the same props): "Connect a bank" for
 * the welcome guide's bank card, the web's `ConnectBank` flow over the existing native Plaid Link (`lib/plaid/link-flow`):
 * mint a Link token, open Link, exchange on the server. Lane E's version then opens the web's "Choose which accounts to
 * import" sheet; until then a linked bank says where to choose them (Connected banks), as Get Started did. Task A2 swaps
 * the import and deletes this file.
 */
export function ConnectBank({
  label = "Connect a bank",
  fullWidth = false,
  testID = "connect-bank",
}: {
  label?: string;
  fullWidth?: boolean;
  testID?: string;
}) {
  const { session } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function start() {
    setError(null);
    setNotice(null);
    setPhase("starting");
    const outcome = await connectBank(
      {
        link: createPlaidLinkClient(),
        fetchLinkToken: async (body) => {
          try {
            const res = await authFetch("/api/plaid/link-token", session, jsonInit("POST", body));
            const j = (await res.json()) as { link_token?: string };
            return res.ok && j.link_token ? { status: "ok", linkToken: j.link_token } : { status: "error", message: "Couldn't start the bank connection. Try again." };
          } catch {
            return { status: "error", message: "Couldn't start the bank connection. Try again." };
          }
        },
        exchange: async (publicToken, institution) => {
          setPhase("exchanging");
          try {
            const res = await authFetch(
              "/api/plaid/exchange",
              session,
              jsonInit("POST", { public_token: publicToken, institution: institution ? { institution_id: institution.id, name: institution.name } : undefined }),
            );
            const j = (await res.json()) as { error?: string; itemId?: string; plaidItemId?: string; accounts?: { plaidAccountId: string; name: string | null }[] };
            if (res.status === 409 && j.error === "already-linked") return { status: "already_linked", itemId: j.itemId ?? "" };
            return res.ok && j.plaidItemId && j.accounts
              ? { status: "ok", plaidItemId: j.plaidItemId, accounts: j.accounts }
              : { status: "error", message: "Couldn't finish connecting the bank. Try again." };
          } catch {
            return { status: "error", message: "Couldn't finish connecting the bank. Try again." };
          }
        },
      },
      currentPlatform(),
    );
    setPhase("idle");
    if (outcome.status === "unavailable") setError("Bank connections aren't available in this build yet. You can add things by hand.");
    else if (outcome.status === "error") setError(outcome.message);
    else if (outcome.status === "already_linked") setNotice("You've already connected this bank.");
    else if (outcome.status === "linked") setNotice("Bank connected. Choose which accounts to import from Connected banks.");
  }

  const busy = phase !== "idle";
  return (
    <View style={{ gap: 8 }}>
      <Button testID={testID} icon="plus" loading={busy} onPress={() => void start()} style={fullWidth ? { alignSelf: "stretch" } : undefined}>
        {phase === "starting" ? "Opening…" : phase === "exchanging" ? "Connecting…" : label}
      </Button>
      {error ? (
        <Text variant="body" color={ROLE.neg} accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20 }}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text variant="body" color={ROLE.muted} style={{ fontSize: 14, lineHeight: 20 }}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

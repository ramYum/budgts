"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Overlay } from "@/components/overlay";
import { AccountMapping, type MappableAccount } from "./account-mapping";
import { LinkHandoff } from "./link-handoff";

type BudgtsAccount = { id: string; name: string };
type Phase = "idle" | "starting" | "linking" | "exchanging" | "mapping";

/**
 * "Connect a bank" entry point (design §8). Mints a Link token, opens Plaid
 * Link, exchanges the `public_token`, then drops the user into account mapping.
 */
export function ConnectBank({
  accounts,
  tone = "primary",
  label = "Connect a bank",
}: {
  accounts: BudgtsAccount[];
  tone?: "primary" | "outline";
  label?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [mapping, setMapping] = useState<{ plaidItemId: string; accounts: MappableAccount[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setNotice(null);
    setPhase("starting");
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const body = (await res.json()) as { link_token?: string };
      if (!res.ok || !body.link_token) throw new Error();
      setLinkToken(body.link_token);
      setPhase("linking");
    } catch {
      setPhase("idle");
      setError("Couldn't start the bank connection. Try again.");
    }
  }, []);

  const handleSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setPhase("exchanging");
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution
              ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
              : undefined,
          }),
        });
        const body = (await res.json()) as {
          error?: string;
          plaidItemId?: string;
          accounts?: MappableAccount[];
        };
        if (res.status === 409 && body.error === "already-linked") {
          setPhase("idle");
          setLinkToken(null);
          setNotice("You've already connected this bank. Reconnect it from the list below if it needs attention.");
          return;
        }
        if (!res.ok || !body.plaidItemId || !body.accounts) throw new Error();
        setLinkToken(null);
        setMapping({ plaidItemId: body.plaidItemId, accounts: body.accounts });
        setPhase("mapping");
      } catch {
        setPhase("idle");
        setLinkToken(null);
        setError("Couldn't finish connecting the bank. Try again.");
      }
    },
    [],
  );

  const handleExit = useCallback(() => {
    setLinkToken(null);
    setPhase((p) => (p === "mapping" ? p : "idle"));
  }, []);

  const closeMapping = useCallback(() => {
    setMapping(null);
    setPhase("idle");
    router.refresh();
  }, [router]);

  const busy = phase === "starting" || phase === "exchanging";
  // "Connect another bank" (outline tone): Deep Pine fill per brand/README.md's
  // documented primary-button color, Volt Lime text as the logo-color accent —
  // keeps the fill compliant with "Volt Lime is never a button" while still
  // giving the label the logo's neon color.
  const btn =
    tone === "primary"
      ? "rounded-lg bg-volt px-3 py-2 text-sm font-semibold text-pine disabled:opacity-50"
      : "rounded-lg bg-pine px-3 py-1.5 text-sm font-semibold text-volt disabled:opacity-50";

  return (
    <div className="space-y-2">
      <button type="button" onClick={start} disabled={busy} className={btn}>
        {phase === "starting"
          ? "Opening…"
          : phase === "exchanging"
            ? "Connecting…"
            : label}
      </button>

      {linkToken && (phase === "linking" || phase === "exchanging") ? (
        <LinkHandoff linkToken={linkToken} onSuccess={handleSuccess} onExit={handleExit} />
      ) : null}

      {error ? <p className="text-sm text-neg">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}

      {mapping ? (
        <Overlay title="Choose which accounts to import" onClose={closeMapping}>
          <AccountMapping
            plaidItemId={mapping.plaidItemId}
            plaidAccounts={mapping.accounts}
            budgtsAccounts={accounts}
            onDone={closeMapping}
          />
        </Overlay>
      ) : null}
    </div>
  );
}

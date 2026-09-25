"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Overlay } from "@/components/overlay";
import { AccountMapping, type MappableAccount } from "./account-mapping";
import { LinkHandoff } from "./link-handoff";
import { clearLinkContext, saveLinkContext } from "./oauth-storage";

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
      // Persisted BEFORE opening Link: an OAuth institution navigates the
      // whole page away, so this is the only way the return trip
      // (`/plaid-oauth`) can find the same token again.
      saveLinkContext(body.link_token, { kind: "connect" });
      setLinkToken(body.link_token);
      setPhase("linking");
    } catch {
      setPhase("idle");
      setError("Couldn't start the bank connection. Try again.");
    }
  }, []);

  const handleSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      clearLinkContext(); // this run completed without leaving the page — nothing left to resume
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
    clearLinkContext();
    setLinkToken(null);
    setPhase((p) => (p === "mapping" ? p : "idle"));
  }, []);

  // Mapping saved: the mapAccounts action's revalidation already re-rendered
  // the page, so just close.
  const closeMapping = useCallback(() => {
    setMapping(null);
    setPhase("idle");
  }, []);

  // Dismissed without mapping: the bank was still created (by the exchange
  // route handler, which can't update the page), so refresh once to show it
  // with its "choose accounts" prompt.
  const cancelMapping = useCallback(() => {
    closeMapping();
    router.refresh();
  }, [closeMapping, router]);

  const busy = phase === "starting" || phase === "exchanging";
  const btn =
    tone === "primary"
      ? "rounded-full bg-primary-btn px-3 py-2 text-sm font-semibold text-on-primary-btn disabled:opacity-50"
      : "rounded-full bg-primary-btn px-3 py-1.5 text-sm font-semibold text-on-primary-btn disabled:opacity-50";

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
        <Overlay title="Choose which accounts to import" onClose={cancelMapping}>
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

"use client";

import { useCallback, useState } from "react";
import { syncConnection } from "@/server/plaid/actions";
import { LinkHandoff } from "./link-handoff";
import { clearLinkContext, saveLinkContext } from "./oauth-storage";

type Phase = "idle" | "starting" | "linking" | "finishing";

/**
 * Reconnect a bank whose login expired (design §23). Runs Plaid Link in update
 * mode against the existing Item — same access token, same cursor — then syncs,
 * which also flips the Item back to `active`.
 */
export function ReconnectButton({ itemId }: { itemId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setPhase("starting");
    try {
      const res = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const body = (await res.json()) as { link_token?: string };
      if (!res.ok || !body.link_token) throw new Error();
      // Persisted BEFORE opening Link — an OAuth institution's reconnect
      // leaves the page entirely; `/plaid-oauth` needs both the token and
      // which item this reconnect was for.
      saveLinkContext(body.link_token, { kind: "reconnect", itemId });
      setLinkToken(body.link_token);
      setPhase("linking");
    } catch {
      setPhase("idle");
      setError("Couldn't start the reconnect. Try again.");
    }
  }, [itemId]);

  const handleSuccess = useCallback(async () => {
    clearLinkContext(); // completed without leaving the page — nothing left to resume
    setLinkToken(null);
    setPhase("finishing");
    await syncConnection(itemId);
    setPhase("idle"); // syncConnection's revalidation already re-rendered the page
  }, [itemId]);

  const busy = phase === "starting" || phase === "finishing";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-full bg-primary-btn px-3 py-1.5 text-sm font-medium text-on-primary-btn disabled:opacity-50"
      >
        {phase === "starting" ? "Opening…" : phase === "finishing" ? "Finishing…" : "Reconnect"}
      </button>
      {linkToken && phase === "linking" ? (
        <LinkHandoff
          linkToken={linkToken}
          onSuccess={handleSuccess}
          onExit={() => {
            clearLinkContext();
            setLinkToken(null);
            setPhase("idle");
          }}
        />
      ) : null}
      {error ? <p className="text-sm text-neg">{error}</p> : null}
    </div>
  );
}

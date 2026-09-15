"use client";

/**
 * Where the browser lands after an OAuth institution's own login page
 * (SoFi, Capital One, most large US banks) — Link left our app entirely for
 * that, so nothing here can rely on React state from the page that started
 * it. `oauth-storage.ts` carries the link token + why Link was opened across
 * that gap. Registered as this deployment's `redirect_uri` in the Plaid
 * dashboard, and only ever reached mid-flow — never a link a user opens on
 * their own (design 2026-09-15, the reconnect-hangs-on-Plaid bug report).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { syncConnection } from "@/server/plaid/actions";
import { clearLinkContext, loadLinkContext } from "@/components/plaid/oauth-storage";

export default function PlaidOAuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Read once: this page's whole lifetime is one resumed Link session.
  const [saved] = useState(() => loadLinkContext());

  const { open, ready } = usePlaidLink({
    token: saved?.linkToken ?? "",
    receivedRedirectUri: typeof window !== "undefined" ? window.location.href : undefined,
    onSuccess: (publicToken, metadata) => {
      clearLinkContext();
      if (publicToken) void finish(publicToken, metadata);
    },
    onExit: () => {
      clearLinkContext();
      router.replace("/connected-banks");
    },
  });

  async function finish(
    publicToken: string,
    metadata: Parameters<NonNullable<Parameters<typeof usePlaidLink>[0]["onSuccess"]>>[1],
  ) {
    if (saved?.context.kind === "reconnect") {
      await syncConnection(saved.context.itemId);
      router.replace("/connected-banks");
      return;
    }
    // Fresh connect: exchange, then land on Connected Banks — a newly
    // exchanged item's accounts come back `link_state: "unmapped"`, which
    // already surfaces "Choose accounts to import" there automatically
    // (bank-connections.tsx), so no separate mapping UI is needed here.
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
      if (!res.ok && res.status !== 409) throw new Error();
    } catch {
      setError("Couldn't finish connecting the bank. Try again from Connected Banks.");
    }
    router.replace("/connected-banks");
  }

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  if (!saved) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted">
          This bank-connection link has expired, or this page was opened directly.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/connected-banks")}
          className="rounded-full bg-primary-btn px-3 py-2 text-sm font-semibold text-on-primary-btn"
        >
          Back to Connected Banks
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted">Finishing your bank connection…</p>
      {error ? <p className="text-sm text-neg">{error}</p> : null}
    </main>
  );
}

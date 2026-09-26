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
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { syncConnection } from "@/server/plaid/actions";
import { clearLinkContext, loadLinkContext } from "@/components/plaid/oauth-storage";
import { Icon } from "@/components/icon";
import { Robin } from "@/components/mascot";
import { StandaloneShell } from "@/components/standalone-shell";
import { Button, IconTile, Stage } from "@/components/ui";

const noSubscribe = () => () => {};

// Module-level, so the snapshot is stable across renders. This page is only
// ever reached by a full page load (the bank's redirect back), so one read
// per page load is exactly one per resumed Link session.
let savedCache: ReturnType<typeof loadLinkContext> | undefined;
function readSavedOnce() {
  if (savedCache === undefined) savedCache = loadLinkContext();
  return savedCache;
}

type StepState = "done" | "working" | "waiting";

export default function PlaidOAuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Where the resumed session stands: Plaid Link finishing, then Budgts saving it.
  const [phase, setPhase] = useState<"linking" | "finishing">("linking");
  const [bank, setBank] = useState<string | null>(null);
  // Read once: this page's whole lifetime is one resumed Link session. Read
  // via useSyncExternalStore, not a useState initializer: sessionStorage
  // doesn't exist on the server, so the SSR pass must render the neutral
  // "Finishing…" state (server snapshot `undefined`) — reading it during the
  // first client render made the server HTML say "link has expired" and
  // the hydration pass disagree with it.
  const saved = useSyncExternalStore(noSubscribe, readSavedOnce, () => undefined);

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

  async function finish(publicToken: string, metadata: PlaidLinkOnSuccessMetadata) {
    setPhase("finishing");
    setBank(metadata.institution?.name ?? null);
    if (saved?.context.kind === "reconnect") {
      try {
        await syncConnection(saved.context.itemId);
        router.replace("/connected-banks");
      } catch {
        // A thrown action (network drop, server error) used to leave this
        // page on "Finishing…" forever with no way out.
        setError("Reconnected, but the sync didn't start. Use Sync now on Connected Banks.");
      }
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
      // Only navigate away on success — an error the user can't read defeats
      // the point of showing one (found in review before this shipped).
      router.replace("/connected-banks");
    } catch {
      setError("Couldn't finish connecting the bank. Try again from Connected Banks.");
    }
  }

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  const toBanks = () => router.replace("/connected-banks");

  if (saved === null || error) {
    return (
      <StandaloneShell>
        <div className="space-y-6">
          <Stage>
            <Robin mood="curious" size={72} />
          </Stage>
          <div className="space-y-2">
            <h1 className="px-figure text-ink">{error ? "The connection didn't finish" : "This link has expired"}</h1>
            <p className={`text-base leading-6 ${error ? "text-neg" : "text-muted"}`}>
              {error ?? "This bank-connection link has expired, or this page was opened directly."}
            </p>
          </div>
          <Button onClick={toBanks} icon="bank" size="lg">
            Back to Connected banks
          </Button>
        </div>
      </StandaloneShell>
    );
  }

  const steps: { label: string; state: StepState }[] = [
    { label: bank ? `Signed in at ${bank}` : "Signed in at your bank", state: "done" },
    { label: "Securing the link with Plaid", state: phase === "linking" ? "working" : "done" },
    { label: "Importing your accounts", state: phase === "finishing" ? "working" : "waiting" },
  ];

  return (
    <StandaloneShell>
      <div className="space-y-6">
        <Stage>
          <div className="flex items-center gap-7 py-3" aria-hidden>
            <IconTile name="bank" size={56} />
            <span className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`cell h-2 w-2 ${i < 2 ? "bg-ink" : i === 2 ? "bg-signal" : "bg-track"}`}
                  style={{ ["--d" as string]: i }}
                />
              ))}
            </span>
            <span className="px-tile-wash flex h-14 w-14 items-center justify-center">
              <Robin size={22} />
            </span>
          </div>
        </Stage>
        <div className="space-y-2">
          <h1 className="px-figure text-balance text-ink">Finishing your bank connection</h1>
          <p className="text-base leading-6 text-muted">This takes a few seconds. Keep this page open.</p>
        </div>
        <ol className="px-card px-rows p-3 md:p-4" aria-live="polite">
          {steps.map((st) => (
            <li key={st.label} className="flex items-center gap-4 py-4 first:pt-1 last:pb-1">
              <span
                className="px-check flex h-5 w-5 shrink-0 items-center justify-center text-white"
                data-state={st.state === "waiting" ? undefined : st.state}
                aria-hidden
              >
                {st.state === "done" ? (
                  <Icon name="check" size={12} />
                ) : st.state === "working" ? (
                  <Icon name="pending" size={12} />
                ) : null}
              </span>
              <span className={`flex-1 text-[15px] leading-6 ${st.state === "waiting" ? "text-muted" : "text-ink"}`}>
                {st.label}
              </span>
              {st.state !== "waiting" ? (
                <span className={`px-tag ${st.state === "done" ? "text-pos" : "text-muted"}`}>
                  {st.state === "done" ? "Done" : "Working"}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="text-center text-[15px] leading-6 text-muted">
          Taking too long?{" "}
          <button
            type="button"
            onClick={toBanks}
            className="press inline-flex items-center gap-1 font-medium text-ink hover:underline"
          >
            Go to Connected banks
            <Icon name="forward" />
          </button>
        </p>
      </div>
    </StandaloneShell>
  );
}

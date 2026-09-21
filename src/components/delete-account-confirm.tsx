"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SecondaryLinkButton } from "@/components/ui";
import { DELETION_SUBSCRIPTION_NOTICE } from "@/lib/billing/manage";

const CONFIRM_PHRASE = "DELETE";

/**
 * The final, destructive step of account deletion — only ever rendered once
 * the page has confirmed a recent sign-in (see delete-account/page.tsx). The
 * server independently re-checks that same freshness before executing
 * anything (`/api/account/delete`), so this component is UX, not the
 * security boundary.
 */
export function DeleteAccountConfirm() {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phrase.trim().toUpperCase() === CONFIRM_PHRASE && !busy;

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        if (res.status === 403 && body.error === "reauth_required") {
          setError("Your sign-in has expired. Refresh this page and verify it's you again.");
        } else {
          setError(body.message ?? "Something went wrong. Please try again.");
        }
        setBusy(false);
        return;
      }
      // The account is already gone/de-identified server-side and every
      // session was revoked — this just clears the browser's own copy of a
      // session that no longer works, then leaves.
      await createClient().auth.signOut();
      router.replace("/sign-in");
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 rounded-2xl border border-hairline p-4">
        <p className="text-sm font-semibold text-heading">This can&apos;t be undone.</p>
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted">
          <li>Every transaction, account, budget, category, and goal you&apos;ve added is deleted.</li>
          <li>Any connected bank is disconnected — Budgts no longer has access to it.</li>
          <li>You&apos;ll be signed out and won&apos;t be able to sign back into this account.</li>
        </ul>
        <p className="text-sm text-muted">
          <strong className="text-text">{DELETION_SUBSCRIPTION_NOTICE}</strong> If you have one, cancel it in the store
          first —{" "}
          <a href="/manage-subscription" className="font-medium text-heading underline underline-offset-2">
            Manage subscription
          </a>
          .
        </p>
      </div>

      <div className="card space-y-3 rounded-2xl border border-hairline p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Type <strong>{CONFIRM_PHRASE}</strong> to confirm
          </span>
          <input
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            aria-label={`Type ${CONFIRM_PHRASE} to confirm account deletion`}
          />
        </label>
        {error ? <p className="text-sm text-neg">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canSubmit}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-neg px-4 py-2.5 text-sm font-semibold text-on-primary-btn transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Permanently delete my account"}
          </button>
          <SecondaryLinkButton href="/settings">Cancel</SecondaryLinkButton>
        </div>
      </div>
    </div>
  );
}

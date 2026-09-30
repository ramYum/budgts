"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { BackLink } from "@/components/page-header";
import { Button, IconTile, LinkButton, TextButton, buttonClass, fieldClass, labelClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { APPLE_MANAGE_URL, DELETION_SUBSCRIPTION_NOTICE, GOOGLE_MANAGE_URL } from "@/lib/billing/manage";
import {
  DELETE_ACCOUNT_PATH,
  REAUTH_WINDOW_MINUTES,
  CONFIRM_WORD,
  confirmWordMatches,
  deletedDestination,
  outcomeFromResponse,
  type DeleteOutcome,
} from "@/lib/account/screen";
import { reauthWithGoogle, requestReauthLink, type ReauthLinkState } from "@/server/account";

export type FlowStage = "intro" | "reauth" | "confirm" | "deleting" | "error" | "signed_out";
type ErrorKind = Exclude<DeleteOutcome["kind"], "deleted" | "reauth" | "signed_out">;

const SETTINGS = "/settings";

/** A full load, replacing this entry: nothing signed-in stays in the history or the router cache. */
function fullLoad(url: string) {
  window.location.replace(url);
}

/**
 * The web account-deletion flow: what happens → a fresh sign-in when the last one is over 10 minutes old → type
 * DELETE → progress → signed out on the confirmation page. Every failure the endpoint can answer has its own state
 * with a way out (outcomeFromResponse). The endpoint decides everything; this screen never deletes anything itself.
 */
export function DeleteAccountFlow({
  email,
  recent,
  google,
  inProgress,
  initial,
  supportEmail,
  billing,
  keepsRecords = true,
  go = fullLoad,
}: {
  email: string;
  /** signed in within the step-up window when the page loaded */
  recent: boolean;
  /** the account can sign in with Google */
  google: boolean;
  /** a deletion already took the lock: the account is read-only until one finishes it */
  inProgress: boolean;
  initial: "intro" | "confirm" | "signed_out";
  /** shown on the errors only while the legal pages are live (the contact is an owner fact) */
  supportEmail: string | null;
  /** this deployment sells subscriptions: say that deleting doesn't cancel one */
  billing: boolean;
  /** any record outlives the account (Path B billing records); false when the owner set retention to 0 */
  keepsRecords?: boolean;
  /** leaves with a full page load (a seam for tests) */
  go?: (url: string) => void;
}) {
  const [stage, setStage] = useState<FlowStage>(() =>
    initial === "confirm" ? (recent ? "confirm" : "reauth") : initial,
  );
  // true once the server said the sign-in went stale mid-flow, so the fresh sign-in explains why it's back
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<ErrorKind>("failed");
  const heading = useRef<HTMLHeadingElement>(null);

  // Each stage change moves focus to its heading, so a screen reader hears where the flow went.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [stage]);

  // Leaving mid-deletion doesn't stop it on the server, but the answer would be lost: ask first.
  useEffect(() => {
    if (stage !== "deleting") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  async function runDeletion() {
    setStage("deleting");
    let outcome: DeleteOutcome;
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      outcome = outcomeFromResponse(res.status, await res.json().catch(() => null));
    } catch {
      outcome = { kind: "network" };
    }
    if (outcome.kind === "deleted") {
      // The server has already revoked the session (or the user is gone). Clear this browser's copy locally, then
      // leave with a full load so no cached signed-in page survives.
      await createClient()
        .auth.signOut({ scope: "local" })
        .catch(() => undefined);
      go(deletedDestination(outcome.storeSubscriptionMayBeActive));
      return;
    }
    if (outcome.kind === "reauth") {
      setStale(true);
      setStage("reauth");
      return;
    }
    if (outcome.kind === "signed_out") {
      setStage("signed_out");
      return;
    }
    setError(outcome.kind);
    setStage("error");
  }

  const titles: Record<FlowStage, string> = {
    intro: "Before you go",
    reauth: "Confirm it's you",
    confirm: "Last step",
    deleting: "Deleting your account",
    error: ERROR_COPY[error].title,
    signed_out: "You've been signed out",
  };

  return (
    <div className="space-y-6" data-testid="delete-account-view">
      <header className="flex min-h-10 items-center gap-2 md:gap-4">
        {/* no way back while the server works (the answer would be lost), but the title keeps its place */}
        {stage === "deleting" ? <span className="h-9 w-9 shrink-0" aria-hidden /> : <BackLink href={SETTINGS} />}
        <div className="min-w-0">
          <h1 className="px-title text-ink" data-testid="page-title">Delete account</h1>
          <h2
            ref={heading}
            tabIndex={-1}
            data-testid="delete-stage"
            className="mt-1 text-[15px] leading-5 text-muted outline-none"
            aria-live="polite"
          >
            {titles[stage]}
          </h2>
        </div>
      </header>

      {stage === "intro" ? (
        <Intro
          inProgress={inProgress}
          billing={billing}
          keepsRecords={keepsRecords}
          onContinue={() => setStage(recent ? "confirm" : "reauth")}
        />
      ) : null}
      {stage === "reauth" ? <Reauth email={email} google={google} stale={stale} /> : null}
      {stage === "confirm" ? <Confirm email={email} inProgress={inProgress} onDelete={runDeletion} /> : null}
      {stage === "deleting" ? <Deleting /> : null}
      {stage === "error" ? <ErrorState kind={error} supportEmail={supportEmail} onRetry={runDeletion} /> : null}
      {stage === "signed_out" ? <SignedOut legalLive={supportEmail !== null} go={go} /> : null}
    </div>
  );
}

/** The account's address: ink, and free to wrap anywhere, since one long address must not push a line out. */
function Email({ email }: { email: string }) {
  return <span className="font-medium text-ink [overflow-wrap:anywhere]">{email}</span>;
}

/* ─── Stages ───────────────────────────────────────────────────────────── */

function Intro({
  inProgress,
  billing,
  keepsRecords,
  onContinue,
}: {
  inProgress: boolean;
  billing: boolean;
  keepsRecords: boolean;
  onContinue: () => void;
}) {
  return (
    <>
      {inProgress ? (
        <div className="px-warn flex items-start gap-3 p-3" role="status" data-testid="delete-in-progress">
          <Icon name="warning" className="text-warn" />
          <p className="text-pretty text-[15px] leading-6 text-ink">
            <span className="font-semibold">Deletion already started.</span> Your account is read-only until it finishes.
            Continue to finish it.
          </p>
        </div>
      ) : null}

      <section className="px-card space-y-4 p-2 md:p-3" aria-label="What happens" data-testid="delete-what-happens">
        <div className="space-y-2">
          <h3 className="t-head text-ink">What&apos;s deleted</h3>
          <ul className="space-y-2">
            <Fact icon="receipt">Your transactions, accounts, categories, budgets and savings goals.</Fact>
            <Fact icon="bank">Every connected bank, disconnected at Plaid.</Fact>
            <Fact icon="sign-out">Your sign-in. You&apos;re signed out everywhere.</Fact>
          </ul>
        </div>
        <div className="px-rule" aria-hidden />
        <div className="space-y-1">
          <h3 className="t-head text-ink">What&apos;s kept</h3>
          <p className="text-pretty text-[15px] leading-6 text-graphite" data-testid="delete-kept">
            {keepsRecords
              ? "Only if you ever paid for a subscription: those billing records, with your email and sign-in details removed."
              : "Nothing. Your data is deleted right away."}
          </p>
        </div>
      </section>

      {billing ? <StoreNotice /> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" arrow onClick={onContinue} className="w-full sm:w-auto" data-testid="delete-continue">
          Continue
        </Button>
        <LinkButton href={SETTINGS} variant="secondary" size="lg" className="w-full sm:w-auto" data-testid="delete-keep">
          Keep my account
        </LinkButton>
      </div>
    </>
  );
}

function Fact({ icon, children }: { icon: "receipt" | "bank" | "sign-out"; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <IconTile name={icon} />
      <p className="text-balance pt-1 text-[15px] leading-6 text-graphite md:pt-2">{children}</p>
    </li>
  );
}

/** Deleting never cancels a store subscription (owner-approved wording): said before, with the stores' own pages. */
function StoreNotice() {
  return (
    <div className="px-warn flex items-start gap-3 p-3" data-testid="delete-store-notice">
      <Icon name="warning" className="text-warn" />
      <p className="text-pretty text-[15px] leading-6 text-ink">
        {DELETION_SUBSCRIPTION_NOTICE} Cancel it first in the{" "}
        <a href={APPLE_MANAGE_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          App Store
        </a>{" "}
        or{" "}
        <a href={GOOGLE_MANAGE_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          Google Play
        </a>
        .
      </p>
    </div>
  );
}

function Reauth({ email, google, stale }: { email: string; google: boolean; stale: boolean }) {
  const [state, action, pending] = useActionState<ReauthLinkState, FormData>(requestReauthLink, {});

  if (state.sent) {
    return (
      <section className="px-card flex items-start gap-3 p-2 md:p-3" role="status" data-testid="delete-link-sent">
        <IconTile name="mail" />
        <div className="min-w-0 space-y-1 pt-1 md:pt-2">
          <p className="text-[15px] font-medium leading-6 text-ink">Check your email</p>
          <p className="text-pretty text-[15px] leading-6 text-graphite">
            We sent a sign-in link to <Email email={email} />. Open it on this device and you&apos;ll come straight back
            here to confirm.
          </p>
          <form action={action}>
            <TextButton type="submit" icon="sync" disabled={pending} data-testid="delete-send-again">
              {pending ? "Sending…" : "Send it again"}
            </TextButton>
          </form>
        </div>
      </section>
    );
  }

  return (
    <>
      {stale ? (
        <div className="px-warn flex items-start gap-3 p-3" role="alert" data-testid="delete-stale">
          <Icon name="warning" className="text-warn" />
          <p className="text-pretty text-[15px] leading-6 text-ink">
            It&apos;s been more than {REAUTH_WINDOW_MINUTES} minutes since you signed in. Nothing was deleted.
          </p>
        </div>
      ) : null}

      <section className="px-card flex items-start gap-3 p-2 md:p-3">
        <IconTile name="key" />
        <p className="min-w-0 text-pretty pt-1 text-[15px] leading-6 text-graphite md:pt-2">
          Deleting your account needs a sign-in from the last {REAUTH_WINDOW_MINUTES} minutes. We&apos;ll email a link to{" "}
          <Email email={email} /> that brings you back here.
        </p>
      </section>

      {state.error ? (
        <p className="text-sm text-neg" role="alert" data-testid="delete-reauth-error">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-3">
        <form action={action}>
          <button className={buttonClass("primary", "w-full", "lg")} type="submit" disabled={pending} data-testid="delete-send-link">
            {pending ? "Sending…" : "Email me a sign-in link"}
            {pending ? null : <Icon name="forward" />}
          </button>
        </form>
        {google ? (
          <>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="px-rule flex-1" />
              or
              <span className="px-rule flex-1" />
            </div>
            <form action={reauthWithGoogle}>
              <button className={buttonClass("secondary", "w-full", "lg")} type="submit" data-testid="delete-google">
                <Icon name="google" />
                Continue with Google
              </button>
            </form>
          </>
        ) : null}
        <LinkButton href={SETTINGS} variant="secondary" size="lg" className="w-full" data-testid="delete-keep">
          Keep my account
        </LinkButton>
      </div>
    </>
  );
}

function Confirm({ email, inProgress, onDelete }: { email: string; inProgress: boolean; onDelete: () => void }) {
  const [typed, setTyped] = useState("");
  const ready = confirmWordMatches(typed);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onDelete();
      }}
    >
      <section className="px-card space-y-4 p-2 md:p-3">
        <p className="text-pretty text-[15px] leading-6 text-graphite">
          {inProgress ? "Finish deleting" : "You're about to permanently delete"} the Budgts account for <Email email={email} />. This can&apos;t be undone.
        </p>
        <label className={labelClass}>
          <span>
            Type <span className="font-semibold text-ink">{CONFIRM_WORD}</span> to confirm
          </span>
          <input
            className={fieldClass}
            data-testid="delete-confirm-word"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
          />
        </label>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={!ready} className={buttonClass("primary", "w-full sm:w-auto disabled:opacity-60", "lg")} data-testid="delete-submit">
          <Icon name="trash" />
          Delete my account
        </button>
        <LinkButton href={SETTINGS} variant="secondary" size="lg" className="w-full sm:w-auto" data-testid="delete-keep">
          Keep my account
        </LinkButton>
      </div>
    </form>
  );
}

function Deleting() {
  return (
    <section className="px-card space-y-4 p-2 md:p-3" role="status" aria-busy="true" data-testid="delete-deleting">
      <div className="flex items-start gap-3">
        <IconTile name="pending" />
        <p className="text-pretty pt-1 text-[15px] leading-6 text-graphite md:pt-2">
          Disconnecting your banks and removing your data. This can take up to a minute, so keep this page open.
        </p>
      </div>
      <div className="skeleton h-3 w-full" aria-hidden />
    </section>
  );
}

const ERROR_COPY: Record<ErrorKind, { title: string; body: string }> = {
  incomplete: {
    title: "Deletion didn't finish",
    body: "We started deleting your account but couldn't finish. It's read-only until it does. Try again to finish it.",
  },
  plaid: {
    title: "A bank wouldn't disconnect",
    body: "We couldn't disconnect one of your banks, so your account wasn't deleted. Disconnect it in Connected banks, then try again.",
  },
  unavailable: {
    title: "Deletion is unavailable",
    body: "Account deletion is temporarily unavailable, and nothing was changed. Try again in a few minutes.",
  },
  uncertain: {
    title: "We couldn't confirm it",
    body: "We didn't get a clear answer from Budgts, so your account may or may not be deleted. Try again: if deletion had already started, trying again finishes it.",
  },
  network: {
    title: "Couldn't reach Budgts",
    body: "Check your connection and try again. If deletion had already started, trying again finishes it.",
  },
  failed: {
    title: "Something went wrong",
    body: "Your account wasn't deleted. Try again.",
  },
};

function ErrorState({ kind, supportEmail, onRetry }: { kind: ErrorKind; supportEmail: string | null; onRetry: () => void }) {
  const copy = ERROR_COPY[kind];
  return (
    <>
      <div className="px-wash flex items-start gap-3 p-3" role="alert" data-testid="delete-error">
        <Icon name="warning" className="text-signal" />
        <p className="text-pretty text-[15px] leading-6 text-ink">{copy.body}</p>
      </div>

      {/* A bank Plaid won't remove: disconnecting it is the next step, retrying comes after. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {kind === "plaid" ? (
          <LinkButton href="/connected-banks" size="lg" icon="bank" className="w-full sm:w-auto" data-testid="delete-connected-banks">
            Connected banks
          </LinkButton>
        ) : null}
        <Button size="lg" icon="sync" variant={kind === "plaid" ? "secondary" : "primary"} onClick={onRetry} className="w-full sm:w-auto" data-testid="delete-retry">
          Try again
        </Button>
        {kind === "plaid" || kind === "incomplete" ? null : (
          <LinkButton href={SETTINGS} variant="secondary" size="lg" className="w-full sm:w-auto" data-testid="delete-back-to-settings">
            Back to Settings
          </LinkButton>
        )}
      </div>

      {supportEmail ? (
        <p className="text-[13px] leading-5 text-muted">
          Still stuck? Email{" "}
          <a href={`mailto:${supportEmail}`} className="font-medium text-ink underline underline-offset-2">
            {supportEmail}
          </a>
          .
        </p>
      ) : null}
    </>
  );
}

function SignedOut({ legalLive, go }: { legalLive: boolean; go: (url: string) => void }) {
  async function signInAgain() {
    // The session is no longer valid server-side; drop this browser's copy so sign-in doesn't bounce back.
    await createClient()
      .auth.signOut({ scope: "local" })
      .catch(() => undefined);
    go(`/sign-in?next=${encodeURIComponent(DELETE_ACCOUNT_PATH)}`);
  }
  return (
    <>
      <section className="px-card flex items-start gap-3 p-2 md:p-3">
        <IconTile name="security" />
        <p className="min-w-0 text-pretty pt-1 text-[15px] leading-6 text-graphite md:pt-2">
          Your session ended, so nothing was deleted. Sign in again and you&apos;ll come back here.
        </p>
      </section>
      <Button size="lg" arrow onClick={() => void signInAgain()} className="w-full sm:w-auto" data-testid="delete-sign-in-again">
        Sign in again
      </Button>
      {legalLive ? (
        <p className="text-[13px] leading-5 text-muted">
          Or read{" "}
          <Link href="/account-deletion" className="font-medium text-ink underline underline-offset-2">
            how deletion works
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}

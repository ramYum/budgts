"use client";

import { useActionState } from "react";
import { ArrowRight, EnvelopeSimple, GoogleLogo } from "@phosphor-icons/react";
import { requestMagicLink, signInWithGoogle, type MagicLinkState } from "@/server/auth";

const field =
  "w-full rounded-xl border border-hairline bg-surface px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-ink";
const button =
  "press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-btn px-4 py-3 text-sm font-medium text-on-primary-btn hover:brightness-95 disabled:opacity-50";

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<MagicLinkState, FormData>(requestMagicLink, {});
  const error = state.error ?? initialError;

  if (state.sent) {
    return (
      <div className="space-y-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2">
          <EnvelopeSimple aria-hidden className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted">We sent a sign-in link. Open it on this device to continue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted">Track spending against your budget.</p>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Email</span>
          <input
            className={field}
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
        {error ? <p className="text-sm text-neg">{error}</p> : null}
        <button className={button} type="submit" disabled={pending}>
          {pending ? "Sending…" : "Email me a sign-in link"}
          {pending ? null : <ArrowRight aria-hidden className="h-4 w-4" />}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-hairline" />
        or
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button
          className="press inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink bg-surface px-4 py-3 text-sm font-medium hover:bg-surface-2"
          type="submit"
        >
          <GoogleLogo aria-hidden weight="bold" className="h-4 w-4" />
          Continue with Google
        </button>
      </form>
    </div>
  );
}

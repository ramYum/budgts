"use client";

import { useActionState } from "react";
import { requestMagicLink, signInWithGoogle, type MagicLinkState } from "@/server/auth";

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const button =
  "w-full rounded-full bg-primary-btn px-3 py-2 text-sm font-medium text-on-primary-btn disabled:opacity-50";

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<MagicLinkState, FormData>(requestMagicLink, {});
  const error = state.error ?? initialError;

  if (state.sent) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted">
          We sent a sign-in link. Open it on this device to continue.
        </p>
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
        <label className="block space-y-1">
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
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button
          className="w-full rounded-full border border-border px-3 py-2 text-sm font-medium"
          type="submit"
        >
          Continue with Google
        </button>
      </form>
    </div>
  );
}

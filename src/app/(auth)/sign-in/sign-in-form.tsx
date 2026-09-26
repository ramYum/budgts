"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icon";
import { IconTile, buttonClass, fieldClass, labelClass } from "@/components/ui";
import { requestMagicLink, signInWithGoogle, type MagicLinkState } from "@/server/auth";

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<MagicLinkState, FormData>(requestMagicLink, {});
  const error = state.error ?? initialError;

  if (state.sent) {
    return (
      <div className="space-y-3" role="status">
        <IconTile name="mail" />
        <h1 className="text-xl font-semibold tracking-tight text-ink">Check your email</h1>
        <p className="text-[15px] leading-6 text-muted">We sent a sign-in link. Open it on this device to continue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="text-[15px] leading-6 text-muted">Track spending against your budget.</p>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className={labelClass}>
          <span>Email</span>
          <input
            className={fieldClass}
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
        {error ? (
          <p className="text-sm text-neg" role="alert">
            {error}
          </p>
        ) : null}
        <button className={buttonClass("primary", "w-full", "lg")} type="submit" disabled={pending}>
          {pending ? "Sending…" : "Email me a sign-in link"}
          {pending ? null : <Icon name="forward" />}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="px-rule flex-1" />
        or
        <span className="px-rule flex-1" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className={buttonClass("secondary", "w-full", "lg")} type="submit">
          <Icon name="google" />
          Continue with Google
        </button>
      </form>
    </div>
  );
}

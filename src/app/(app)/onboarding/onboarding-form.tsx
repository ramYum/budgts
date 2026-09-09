"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "@/server/onboarding";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/profile";

export function OnboardingForm({ defaultCurrency }: { defaultCurrency: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});

  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Currency</span>
        <select
          name="currency"
          defaultValue={defaultCurrency}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
      >
        {pending ? "Saving…" : "Start budgeting"}
      </button>
    </form>
  );
}

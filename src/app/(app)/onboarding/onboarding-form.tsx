"use client";

import { useActionState } from "react";
import type { OnboardingState } from "@/server/onboarding";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/profile";
import { Mascot } from "@/components/mascot";
import { PrimaryButton } from "@/components/ui";

/**
 * The one required first-run step: pick a currency. (Budgts currently has no
 * app tour — this is account setup, not a walkthrough.)
 */
export function OnboardingForm({
  defaultCurrency,
  action,
}: {
  defaultCurrency: string;
  action: (prev: OnboardingState, formData: FormData) => Promise<OnboardingState>;
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(action, {});

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="brand-mascot-stage flex flex-col items-center gap-3 px-8 py-6">
          <Mascot mood="normal" size={120} />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Pick your currency</h1>
          <p className="text-sm text-muted">Let&apos;s make a little space for the life you want.</p>
        </div>

        <form action={formAction} className="w-full space-y-3 text-left">
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
          <PrimaryButton type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Start budgeting"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

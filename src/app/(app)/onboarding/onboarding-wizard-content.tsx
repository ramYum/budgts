"use client";

import { useActionState } from "react";
import type { OnboardingState } from "@/server/onboarding";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/profile";
import { TourWizard, type WizardStep } from "@/components/tour/tour-wizard";
import { TourCard } from "@/components/tour/tour-card";
import { PurchaseIconRow } from "@/components/tour/purchase-icons";
import { PrimaryButton } from "@/components/ui";
import type { TourStepId } from "@/lib/tour/steps";

/**
 * Welcome → (Every purchase, tracked →) Currency. The currency step is
 * required — Skip on the earlier steps jumps straight to it rather than
 * leaving the flow (unlike /tour's Skip, which ends the tour entirely). See
 * docs/specs/2026-09-15-first-run-tour-design.md.
 */
export function OnboardingWizardContent({
  stepIds,
  defaultCurrency,
  action,
}: {
  stepIds: TourStepId[];
  defaultCurrency: string;
  action: (prev: OnboardingState, formData: FormData) => Promise<OnboardingState>;
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(action, {});

  const steps: WizardStep[] = stepIds.map((id, i) => ({
    id,
    label: STEP_LABEL[id],
    render: (nav) => {
      const shared = {
        dotCount: stepIds.length,
        dotIndex: i,
        onBack: nav.isFirst ? undefined : nav.back,
        onSkip: nav.isLast ? undefined : nav.jumpToLast,
      };

      switch (id) {
        case "welcome":
          return (
            <TourCard
              {...shared}
              mood="happy"
              heading="Budgeting that does itself."
              body="Budgts keeps track of your money for you — so you don't have to."
              primary={<PrimaryButton onClick={nav.next}>Get started</PrimaryButton>}
            />
          );
        case "auto-capture":
          return (
            <TourCard
              {...shared}
              mood="curious"
              heading="Every purchase, tracked"
              body="Tap, swipe or shop online — Budgts picks up your purchases automatically. No typing. No receipts."
              media={<PurchaseIconRow />}
              primary={<PrimaryButton onClick={nav.next}>Next</PrimaryButton>}
            />
          );
        case "currency":
          return (
            <TourCard
              {...shared}
              mood="normal"
              heading="Pick your currency"
              body="Let's make a little space for the life you want."
              media={
                <form action={formAction} className="space-y-3 text-left">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted">Currency</span>
                    <select
                      name="currency"
                      defaultValue={defaultCurrency}
                      className="w-full rounded-xl border border-hairline bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-ink"
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
              }
            />
          );
        default:
          // "bank" | "auto-sort" | "money-left" | "done" belong to /tour.
          return null;
      }
    },
  }));

  return <TourWizard steps={steps} />;
}

const STEP_LABEL: Record<TourStepId, string> = {
  welcome: "Welcome",
  "auto-capture": "Every purchase, tracked",
  currency: "Your currency",
  bank: "Connect your bank",
  "auto-sort": "Sorted for you",
  "money-left": "Know what's left",
  done: "You're all set",
};

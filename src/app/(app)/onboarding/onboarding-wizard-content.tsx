"use client";

import { useActionState, useState } from "react";
import type { OnboardingState } from "@/server/onboarding";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/profile";
import { TourWizard, type WizardStep } from "@/components/tour/tour-wizard";
import { TourCard } from "@/components/tour/tour-card";
import { GuideScene } from "@/components/tour/scenes";
import { GUIDE_COPY } from "@/components/tour/guide-copy";
import { PrimaryButton } from "@/components/ui";
import type { TourStepId } from "@/lib/tour/steps";

/**
 * The welcome guide's first half: Crystal → what Budgts does → (every
 * purchase, tracked →) currency. The currency step is required — Skip on the
 * earlier steps jumps straight to it rather than leaving the flow (unlike
 * /tour's Skip, which ends the guide). See
 * docs/specs/2026-09-25-welcome-guide-design.md.
 */
export function OnboardingWizardContent({
  stepIds,
  totalVisible,
  defaultCurrency,
  action,
}: {
  stepIds: TourStepId[];
  /** Cells in the whole guide, this half and the /tour half after it. */
  totalVisible: number;
  defaultCurrency: string;
  action: (prev: OnboardingState, formData: FormData) => Promise<OnboardingState>;
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(action, {});
  // Drives the currency scene's live preview; the form still submits the select.
  const [currency, setCurrency] = useState(defaultCurrency);

  const steps: WizardStep[] = stepIds.map((id, i) => ({
    id,
    label: GUIDE_COPY[id].label,
    render: (nav) => {
      const copy = GUIDE_COPY[id];
      const shared = {
        heading: copy.heading,
        body: copy.body,
        scene: <GuideScene id={id} currency={currency} />,
        dotCount: totalVisible,
        dotIndex: i,
        onBack: nav.isFirst ? undefined : nav.back,
        onSkip: nav.isLast ? undefined : nav.jumpToLast,
      };
      const next = (
        <PrimaryButton arrow onClick={nav.next} className="w-full">
          {copy.cta}
        </PrimaryButton>
      );

      switch (id) {
        case "crystal":
        case "welcome":
        case "auto-capture":
          return <TourCard {...shared} primary={next} />;
        case "currency":
          return (
            <TourCard
              {...shared}
              media={
                <form action={formAction} className="space-y-3 text-left">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted">Currency</span>
                    <select
                      name="currency"
                      defaultValue={defaultCurrency}
                      onChange={(e) => setCurrency(e.target.value)}
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
                  <PrimaryButton type="submit" arrow={!pending} disabled={pending} className="w-full">
                    {pending ? "Saving…" : copy.cta}
                  </PrimaryButton>
                </form>
              }
            />
          );
        default:
          // "bank" | "auto-sort" | "money-left" | "plan" | "done" belong to /tour.
          return null;
      }
    },
  }));

  return <TourWizard steps={steps} total={totalVisible} />;
}

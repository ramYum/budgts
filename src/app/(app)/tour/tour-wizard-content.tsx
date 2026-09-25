"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { TourState } from "@/server/tour";
import { TourWizard, type WizardStep } from "@/components/tour/tour-wizard";
import { TourCard } from "@/components/tour/tour-card";
import { GuideScene } from "@/components/tour/scenes";
import { GUIDE_COPY } from "@/components/tour/guide-copy";
import { ConnectBank } from "@/components/plaid/connect-bank";
import { PrimaryButton } from "@/components/ui";
import type { TourStepId } from "@/lib/tour/steps";

const COMPLETE_FORM_ID = "tour-complete-form";

/**
 * The welcome guide's second half (and the whole guide on a replay from
 * Help). Builds the visible cards from the server-resolved id list. `stepIds`
 * is captured once via useState's initializer — a later `router.refresh()`
 * (e.g. ConnectBank closing its account-mapping overlay) must not reshuffle
 * which cards are showing mid-guide (design:
 * docs/specs/2026-09-25-welcome-guide-design.md).
 */
export function TourWizardContent({
  stepIds,
  offset,
  totalVisible,
  currency,
  accounts,
  action,
}: {
  stepIds: TourStepId[];
  offset: number;
  totalVisible: number;
  /** The user's currency, for the scenes' sample amounts. */
  currency: string;
  accounts: { id: string; name: string }[];
  action: (prev: TourState, formData: FormData) => Promise<TourState>;
}) {
  const [fixedStepIds] = useState(stepIds);
  const [state, formAction] = useActionState<TourState, FormData>(action, {});

  const steps: WizardStep[] = fixedStepIds.map((id, i) => ({
    id,
    label: GUIDE_COPY[id].label,
    render: (nav) => {
      const copy = GUIDE_COPY[id];
      const shared = {
        heading: copy.heading,
        body: copy.body,
        scene: <GuideScene id={id} currency={currency} />,
        dotCount: totalVisible,
        dotIndex: offset + i,
        onBack: nav.isFirst ? undefined : nav.back,
        onSkip: nav.isLast
          ? undefined
          : () =>
              (document.getElementById(COMPLETE_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
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
        case "auto-sort":
        case "money-left":
        case "plan":
          return <TourCard {...shared} primary={next} />;
        case "bank":
          return (
            <TourCard
              {...shared}
              media={<ConnectBank accounts={accounts} label={copy.cta} fullWidth />}
              secondary={
                <button
                  type="button"
                  onClick={nav.next}
                  className="press rounded-lg px-2 py-1 text-sm font-medium text-muted hover:text-text"
                >
                  I&apos;ll add things by hand →
                </button>
              }
            />
          );
        case "done":
          return (
            <TourCard
              {...shared}
              primary={
                <PrimaryButton type="submit" form={COMPLETE_FORM_ID} arrow className="w-full">
                  {copy.cta}
                </PrimaryButton>
              }
              footnote={
                <>
                  Replay this guide, or read{" "}
                  <Link href="/help/how-it-works" className="font-medium text-neg">
                    How Budgts Works
                  </Link>
                  , anytime from Help.
                </>
              }
            />
          );
        case "currency":
          // Never appears on /tour — /onboarding owns this step.
          return null;
      }
    },
  }));

  return (
    <>
      {/* Backs both Skip (any step) and the final "See my finances" button —
       * see docs/specs/2026-09-15-first-run-tour-design.md. */}
      <form id={COMPLETE_FORM_ID} action={formAction} className="hidden" aria-hidden />
      {state.error ? (
        <p role="alert" className="fixed inset-x-0 top-4 z-50 px-6 text-center text-sm text-neg">
          {state.error}
        </p>
      ) : null}
      <TourWizard steps={steps} offset={offset} total={totalVisible} />
    </>
  );
}

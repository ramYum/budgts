"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { TourState } from "@/server/tour";
import { TourWizard, type WizardStep } from "@/components/tour/tour-wizard";
import { TourCard } from "@/components/tour/tour-card";
import { PurchaseIconRow } from "@/components/tour/purchase-icons";
import { ConnectBank } from "@/components/plaid/connect-bank";
import { PrimaryButton } from "@/components/ui";
import type { TourStepId } from "@/lib/tour/steps";

const COMPLETE_FORM_ID = "tour-complete-form";

/**
 * Builds the visible wizard steps from the server-resolved id list. `stepIds`
 * is captured once via useState's initializer — a later `router.refresh()`
 * (e.g. ConnectBank closing its account-mapping overlay) must not reshuffle
 * which cards are showing mid-tour (design: docs/specs/2026-09-15-first-run-tour-design.md).
 */
export function TourWizardContent({
  stepIds,
  offset,
  totalVisible,
  accounts,
  action,
}: {
  stepIds: TourStepId[];
  offset: number;
  totalVisible: number;
  accounts: { id: string; name: string }[];
  action: (prev: TourState, formData: FormData) => Promise<TourState>;
}) {
  const [fixedStepIds] = useState(stepIds);
  const [state, formAction] = useActionState<TourState, FormData>(action, {});

  const steps: WizardStep[] = fixedStepIds.map((id, i) => ({
    id,
    label: STEP_LABEL[id],
    render: (nav) => {
      const shared = {
        dotCount: totalVisible,
        dotIndex: offset + i,
        onBack: nav.isFirst ? undefined : nav.back,
        onSkip: nav.isLast
          ? undefined
          : () =>
              (document.getElementById(COMPLETE_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
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
        case "bank":
          return (
            <TourCard
              {...shared}
              mood="curious"
              heading="Connect your bank to turn it on"
              body="This is what makes tracking automatic. Your bank login never reaches Budgts."
              media={<ConnectBank accounts={accounts} />}
              secondary={
                <button type="button" onClick={nav.next} className="text-sm font-medium text-muted hover:text-text">
                  I&apos;ll add things by hand →
                </button>
              }
            />
          );
        case "auto-sort":
          return (
            <TourCard
              {...shared}
              mood="happy"
              heading="Sorted for you"
              body="Budgts puts each purchase in the right category. Not sure? It asks once — then remembers. The more you use it, the less it asks."
              primary={<PrimaryButton onClick={nav.next}>Next</PrimaryButton>}
            />
          );
        case "money-left":
          return (
            <TourCard
              {...shared}
              mood="normal"
              heading="Know what's left"
              body="Home shows your Money Left this month. Set budgets to see what you can still spend."
              primary={<PrimaryButton onClick={nav.next}>Next</PrimaryButton>}
            />
          );
        case "done":
          return (
            <TourCard
              {...shared}
              mood="happy"
              heading="You're all set"
              body="Spend like normal — Budgts handles the rest."
              footnote={
                <>
                  Replay this tour, or see the whole workflow in{" "}
                  <Link href="/help/how-it-works" className="font-medium text-accent">
                    How Budgts Works
                  </Link>
                  , anytime from Help.
                </>
              }
              primary={
                <PrimaryButton type="submit" form={COMPLETE_FORM_ID}>
                  See my finances
                </PrimaryButton>
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
      <TourWizard steps={steps} />
    </>
  );
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

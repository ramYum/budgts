"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type StepNav = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  back: () => void;
  /** Onboarding's Skip jumps straight to the required last step (currency),
   * rather than leaving the flow — see docs/specs/2026-09-15-first-run-tour-design.md. */
  jumpToLast: () => void;
};

export type WizardStep = {
  id: string;
  /** Short human label for the step, announced to assistive tech — not
   * necessarily the on-card heading text. */
  label: string;
  render: (nav: StepNav) => ReactNode;
};

/**
 * Generic full-screen step navigator shared by /onboarding and /tour. Owns
 * only index state, keyboard/focus navigation, and the fade transition — the
 * actual card content (and what Skip/Next/final buttons do) is supplied by
 * each step's `render`, since onboarding and the tour need different Skip
 * and completion behavior (see tour-card.tsx for the shared visual shell).
 *
 * `steps` is expected to be stable for the component's lifetime — the caller
 * resolves it once (see src/lib/tour/steps.ts) so a mid-tour data refresh
 * (e.g. after connecting a bank) never reshuffles the flow underfoot.
 */
export function TourWizard({ steps }: { steps: WizardStep[] }) {
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stageRef.current?.querySelector<HTMLElement>("#tour-step-heading")?.focus();
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  const step = steps[index];
  const nav: StepNav = {
    index,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    next: () => setIndex((i) => Math.min(i + 1, steps.length - 1)),
    back: () => setIndex((i) => Math.max(i - 1, 0)),
    jumpToLast: () => setIndex(steps.length - 1),
  };

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg p-6">
      <p className="sr-only" aria-live="polite">
        {`Step ${index + 1} of ${steps.length}: ${step.label}`}
      </p>
      <div key={step.id} ref={stageRef} className="w-full animate-[tour-in_0.25s_ease-out] motion-reduce:animate-none">
        {step.render(nav)}
      </div>
    </div>
  );
}

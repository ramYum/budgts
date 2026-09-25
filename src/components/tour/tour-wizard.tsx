"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./guide.module.css";

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

type Position = { index: number; dir: "none" | "next" | "back" };

/** Move by `delta` steps within [0, last], remembering the direction. */
function move(p: Position, delta: number, last: number): Position {
  const to = Math.min(Math.max(p.index + delta, 0), last);
  return to === p.index ? p : { index: to, dir: delta > 0 ? "next" : "back" };
}

/**
 * Full-screen step navigator for the welcome guide, shared by /onboarding and
 * /tour. Owns only position, keyboard/focus navigation and the direction of
 * travel (the next card enters from the right, going back from the left; see
 * guide.module.css). The card content, and what Skip / Next / the final button
 * do, is supplied by each step's `render`, since onboarding and the tour need
 * different Skip and completion behavior.
 *
 * `steps` is expected to be stable for the component's lifetime — the caller
 * resolves it once (see src/lib/tour/steps.ts) so a mid-tour data refresh
 * (e.g. after connecting a bank) never reshuffles the flow underfoot.
 * `offset`/`total` place this route's steps within the whole guide, so the
 * announcement matches the progress cells across /onboarding → /tour.
 */
export function TourWizard({
  steps,
  offset = 0,
  total = steps.length,
}: {
  steps: WizardStep[];
  offset?: number;
  total?: number;
}) {
  const [{ index, dir }, setPosition] = useState<Position>({ index: 0, dir: "none" });
  const stageRef = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;

  useEffect(() => {
    stageRef.current?.querySelector<HTMLElement>("#tour-step-heading")?.focus();
  }, [index]);

  const moveBy = (delta: number) => setPosition((p) => move(p, delta, last));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (delta) setPosition((p) => move(p, delta, last));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const step = steps[index];
  const nav: StepNav = {
    index,
    isFirst: index === 0,
    isLast: index === last,
    next: () => moveBy(1),
    back: () => moveBy(-1),
    jumpToLast: () => moveBy(last - index),
  };

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center overflow-x-clip bg-bg px-5 py-6">
      <p className="sr-only" aria-live="polite">
        {`Step ${offset + index + 1} of ${total}: ${step.label}`}
      </p>
      <div key={step.id} ref={stageRef} data-dir={dir} className={`${s.stage} flex w-full justify-center`}>
        {step.render(nav)}
      </div>
    </div>
  );
}

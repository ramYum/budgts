/**
 * Pure step-sequencing for the first-run tour (see
 * docs/specs/2026-09-15-first-run-tour-design.md). No DB calls, no React —
 * callers resolve `plaidEnabled` / `hasBank` from already-fetched data and
 * hold the result for the lifetime of one wizard mount (a mid-tour
 * `router.refresh()`, e.g. after connecting a bank, must not reshuffle it).
 */

export type TourStepId =
  | "welcome"
  | "auto-capture"
  | "currency"
  | "bank"
  | "auto-sort"
  | "money-left"
  | "done";

export type TourStep = { id: TourStepId };

export type BuildTourStepsInput = {
  /** `/onboarding` (pre-account setup, ends at "currency") vs `/tour`
   * (post-onboarding explainer cards, ends at "done"). */
  phase: "onboarding" | "tour";
  plaidEnabled: boolean;
  /** User already has ≥1 `plaid_items` row. */
  hasBank: boolean;
  /** Arrived via `/tour?new=1`, straight from `/onboarding` — the pitch
   * cards (welcome, auto-capture) were just shown there, so `/tour` skips
   * them. false means a replay (Help) or an existing user's first visit
   * after the tour shipped: those get the pitch prepended. */
  justOnboarded: boolean;
};

export type BuildTourStepsResult = {
  steps: TourStep[];
  /** Dots already shown before this route's first step, for a progress
   * indicator that stays continuous across /onboarding → /tour. */
  offset: number;
  /** offset + steps.length. */
  totalVisible: number;
};

function onboardingStepIds(plaidEnabled: boolean): TourStepId[] {
  const ids: TourStepId[] = ["welcome"];
  if (plaidEnabled) ids.push("auto-capture");
  ids.push("currency");
  return ids;
}

function tourStepIds({
  plaidEnabled,
  hasBank,
  justOnboarded,
}: Omit<BuildTourStepsInput, "phase">): TourStepId[] {
  const ids: TourStepId[] = [];
  if (!justOnboarded) {
    ids.push("welcome");
    if (plaidEnabled) ids.push("auto-capture");
  }
  if (plaidEnabled && !hasBank) ids.push("bank");
  if (plaidEnabled) ids.push("auto-sort");
  ids.push("money-left");
  ids.push("done");
  return ids;
}

export function buildTourSteps(input: BuildTourStepsInput): BuildTourStepsResult {
  if (input.phase === "onboarding") {
    const ids = onboardingStepIds(input.plaidEnabled);
    return { steps: ids.map((id) => ({ id })), offset: 0, totalVisible: ids.length };
  }

  const ids = tourStepIds(input);
  const offset = input.justOnboarded ? onboardingStepIds(input.plaidEnabled).length : 0;
  return { steps: ids.map((id) => ({ id })), offset, totalVisible: offset + ids.length };
}

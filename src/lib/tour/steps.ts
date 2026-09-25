/**
 * Pure step-sequencing for the welcome guide, the first-run tour (see
 * docs/specs/2026-09-25-welcome-guide-design.md, which builds on
 * docs/specs/2026-09-15-first-run-tour-design.md). No DB calls, no React —
 * callers resolve `plaidEnabled` / `hasBank` from already-fetched data and
 * hold the result for the lifetime of one wizard mount (a mid-tour
 * `router.refresh()`, e.g. after connecting a bank, must not reshuffle it).
 */

export type TourStepId =
  | "crystal"
  | "welcome"
  | "auto-capture"
  | "currency"
  | "bank"
  | "auto-sort"
  | "money-left"
  | "plan"
  | "done";

export type TourStep = { id: TourStepId };

export type BuildTourStepsInput = {
  /** `/onboarding` (pre-account setup, ends at "currency") vs `/tour`
   * (post-onboarding explainer cards, ends at "done"). */
  phase: "onboarding" | "tour";
  plaidEnabled: boolean;
  /** User already has ≥1 `plaid_items` row. */
  hasBank: boolean;
  /** Arrived via `/tour?new=1`, straight from `/onboarding` — the intro
   * cards (crystal, welcome, auto-capture) were just shown there, so `/tour` skips
   * them. false means a replay (Help) or an existing user's first visit
   * after the tour shipped: those get the pitch prepended. */
  justOnboarded: boolean;
};

export type BuildTourStepsResult = {
  steps: TourStep[];
  /** Dots already shown before this route's first step, for a progress
   * indicator that stays continuous across /onboarding → /tour. */
  offset: number;
  /** Cells in the whole guide: offset + steps.length on /tour; on
   * /onboarding, its steps plus the /tour?new=1 steps that follow. */
  totalVisible: number;
};

/** Crystal introduces herself, then says what Budgts does. */
function introStepIds(plaidEnabled: boolean): TourStepId[] {
  return plaidEnabled ? ["crystal", "welcome", "auto-capture"] : ["crystal", "welcome"];
}

function onboardingStepIds(plaidEnabled: boolean): TourStepId[] {
  return [...introStepIds(plaidEnabled), "currency"];
}

function tourStepIds({
  plaidEnabled,
  hasBank,
  justOnboarded,
}: Omit<BuildTourStepsInput, "phase">): TourStepId[] {
  const ids: TourStepId[] = justOnboarded ? [] : introStepIds(plaidEnabled);
  if (plaidEnabled && !hasBank) ids.push("bank");
  if (plaidEnabled) ids.push("auto-sort");
  ids.push("money-left", "plan", "done");
  return ids;
}

export function buildTourSteps(input: BuildTourStepsInput): BuildTourStepsResult {
  if (input.phase === "onboarding") {
    const ids = onboardingStepIds(input.plaidEnabled);
    // Progress counts the whole guide: this half plus the /tour?new=1 half
    // that follows it, so the cells never jump at the hand-off.
    const rest = tourStepIds({ plaidEnabled: input.plaidEnabled, hasBank: input.hasBank, justOnboarded: true });
    return { steps: ids.map((id) => ({ id })), offset: 0, totalVisible: ids.length + rest.length };
  }

  const ids = tourStepIds(input);
  const offset = input.justOnboarded ? onboardingStepIds(input.plaidEnabled).length : 0;
  return { steps: ids.map((id) => ({ id })), offset, totalVisible: offset + ids.length };
}

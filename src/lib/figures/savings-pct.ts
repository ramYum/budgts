/**
 * How much of the savings target is saved, for the savings cards: two figures the goals rollup already produced
 * (`GoalsSummary.totalSaved`, `.totalTarget`), turned into a percentage for display. Zero when there is no target.
 *
 * Moved verbatim out of `src/components/goals-view.tsx` (the Total saved line and bar) and `dashboard-view.tsx` (Home's
 * savings badge and bar), 2026-09-30, Phase 3 D5, so the web and the native app print the same number from one
 * implementation. Pure TypeScript with no imports: the native app reads this folder through Metro `watchFolders`
 * (tests/unit/brand-purity.test.ts keeps it pure).
 */

/** The whole-percent share (Math.round), uncapped: Goals' "N% of $X" and bar, Home's badge. */
export function savingsPct(totalSaved: number, totalTarget: number): number {
  return totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;
}

/** The exact share, unrounded and unclamped: Home's savings bar (the bar itself clamps to 0..100). */
export function savingsBarPct(totalSaved: number, totalTarget: number): number {
  return totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
}

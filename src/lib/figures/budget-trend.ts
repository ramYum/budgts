/**
 * "vs. last month" on the Budgets category sheet: the whole-percent change of a category's spending against last month's,
 * from two figures the month's rollup already produced (`DashboardBar.actual` this month and last). Null when last month
 * had nothing above zero to compare with, and the sheet leaves the row out. Positive means spending grew (the sheet's up
 * arrow, in red); zero or negative reads as down (green).
 *
 * Moved verbatim out of `src/components/budgets-view.tsx` (2026-09-30, Phase 3 D4) so the web sheet and the native one
 * print the same number from one implementation. Pure TypeScript with no imports: the native app reads this folder
 * through Metro `watchFolders` (tests/unit/brand-purity.test.ts keeps it pure).
 */
export function budgetTrendPct(actual: number, prevActual: number): number | null {
  return prevActual > 0 ? Math.round(((actual - prevActual) / prevActual) * 100) : null;
}

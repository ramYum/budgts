/**
 * Savings Rate — Money Left ÷ Income, for one calendar month. A cash-flow
 * proxy, not a verified-accumulation claim (design: 2026-09-13 Money Left /
 * Savings Rate §2/§8). Never clamped: a negative rate (overspent) and a rate
 * over 1 (net refunds/income exceeding spend) are both real, valid results.
 */
export function savingsRate(income: number, moneyLeft: number): number | null {
  if (income <= 0) return null; // "not available" -- never a bare 0%
  return moneyLeft / income;
}

/**
 * The review warnings every financial screen carries while a bank account is flagged or excluded (design: 2026-09-12
 * duplicate-feed investigation, 2026-09-13 Advancial containment). Shared by the web `<ReviewBanner>` (in the dashboard
 * layout) and the native `GET /api/mobile/status` (moved out of the component, 2026-09-29, Stage 2B).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

function summarizeNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} other account${names.length - 1 === 1 ? "" : "s"}`;
}

export interface ReviewBannerAccount {
  name: string | null;
  needsReview: boolean;
  excludedFromCalculations: boolean;
}

export type ReviewMessages = { advisory: string | null; excluded: string | null };

/**
 * Splits flagged accounts into two independent messages (design: 2026-09-13
 * Advancial containment): an **excluded** account (an explicit owner
 * decision — its data no longer counts toward totals) gets its own,
 * distinct message and is never also listed in the **advisory** message
 * (merely `needsReview`, totals still include it) — the two states must
 * never be blurred together, since one is "you should look at this" and the
 * other is "this has already been acted on."
 */
export function buildReviewMessages(accounts: ReviewBannerAccount[]): ReviewMessages {
  const excludedAccounts = accounts.filter((a) => a.excludedFromCalculations);
  const advisoryAccounts = accounts.filter((a) => a.needsReview && !a.excludedFromCalculations);

  const excluded =
    excludedAccounts.length === 0
      ? null
      : `${summarizeNames(excludedAccounts.map((a) => a.name ?? "an account"))} ${
          excludedAccounts.length === 1 ? "is" : "are"
        } excluded from your financial totals because its bank feed showed unreliable data. Nothing was deleted. Every transaction is still in your history.`;

  const advisory =
    advisoryAccounts.length === 0
      ? null
      : `${summarizeNames(advisoryAccounts.map((a) => a.name ?? "an account"))} showed unusually repetitive transaction data from your bank. Nothing has been removed or changed.`;

  return { advisory, excluded };
}

/**
 * The caller's current review messages (both null when nothing is flagged). Self-gates like `BankConnections`: a read
 * error (the Plaid tables not migrated on this deployment) is "nothing flagged", the web banner's long-standing behaviour.
 */
export async function loadReviewMessages(supabase: SupabaseClient): Promise<ReviewMessages> {
  const { data, error } = await supabase
    .from("plaid_accounts")
    .select("name, needs_review, excluded_from_calculations")
    .or("needs_review.eq.true,excluded_from_calculations.eq.true")
    .limit(1000);
  if (error || !data || data.length === 0) return { advisory: null, excluded: null };
  return buildReviewMessages(
    (data as { name: string | null; needs_review: boolean; excluded_from_calculations: boolean }[]).map((a) => ({
      name: a.name,
      needsReview: a.needs_review,
      excludedFromCalculations: a.excluded_from_calculations,
    })),
  );
}

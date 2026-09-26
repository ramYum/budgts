import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { Icon } from "@/components/icon";

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

/**
 * Splits flagged accounts into two independent messages (design: 2026-09-13
 * Advancial containment): an **excluded** account (an explicit owner
 * decision — its data no longer counts toward totals) gets its own,
 * distinct message and is never also listed in the **advisory** message
 * (merely `needsReview`, totals still include it) — the two states must
 * never be blurred together, since one is "you should look at this" and the
 * other is "this has already been acted on."
 */
export function buildReviewMessages(accounts: ReviewBannerAccount[]): {
  advisory: string | null;
  excluded: string | null;
} {
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
 * Owner-facing warning for an anomaly-flagged connection (design: 2026-09-12
 * duplicate-feed investigation) and for a calculation-excluded one (design:
 * 2026-09-13 Advancial containment). Rendered once in the dashboard layout
 * so it reaches every financial surface (Dashboard, Transactions, Budgets,
 * Goals) — neither state's numbers should ever look like an ordinary total.
 *
 * Self-gates like `BankConnections`: inert until the relevant migrations
 * have run and no account is flagged/excluded. No dismiss control for
 * either message — changing either state is a deliberate owner action in
 * Settings, never something a stray tap on the banner can do.
 */
export async function ReviewBanner() {
  if (!plaidUiEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plaid_accounts")
    .select("name, needs_review, excluded_from_calculations")
    .or("needs_review.eq.true,excluded_from_calculations.eq.true");
  if (error || !data || data.length === 0) return null;

  const { advisory, excluded } = buildReviewMessages(
    data.map((a) => ({
      name: a.name,
      needsReview: a.needs_review,
      excludedFromCalculations: a.excluded_from_calculations,
    })),
  );
  if (!advisory && !excluded) return null;

  return (
    // the pages' own column, so the warning lines up with what it qualifies
    <div className="mx-auto w-full max-w-[1136px] space-y-3 px-4 pt-3 md:px-12 md:pt-8">
      {excluded ? (
        <div className="px-wash flex items-start gap-3 p-3 text-[15px] leading-6 text-ink md:p-4">
          <Icon name="warning" className="text-signal" />
          <p>
            <span className="font-semibold text-signal-ink">Excluded from totals.</span> {excluded}{" "}
            <Link href="/settings" className="font-medium underline underline-offset-2">
              Review it in Settings
            </Link>
            .
          </p>
        </div>
      ) : null}
      {advisory ? (
        <div className="px-warn flex items-start gap-3 p-3 text-[15px] leading-6 text-ink md:p-4">
          <Icon name="warning" className="text-warn" />
          <p>
            <span className="font-semibold">Totals may be inaccurate.</span> {advisory}{" "}
            <Link href="/settings" className="font-medium underline underline-offset-2">
              Review it in Settings
            </Link>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}

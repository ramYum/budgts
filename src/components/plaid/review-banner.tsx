import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { loadReviewMessages } from "@/lib/plaid/review-messages";
import { Icon } from "@/components/icon";

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
  // The read and the wording live in loadReviewMessages, shared with the native app's GET /api/mobile/status.
  const { advisory, excluded } = await loadReviewMessages(await createClient());
  if (!advisory && !excluded) return null;

  return (
    // the pages' own column, so the warning lines up with what it qualifies
    <div className="mx-auto w-full max-w-[1136px] space-y-3 px-6 pt-3 md:px-12 md:pt-8">
      {excluded ? (
        <div className="px-wash flex items-start gap-3 p-3 text-[15px] leading-6 text-ink md:p-4" data-testid="review-banner-excluded">
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
        <div className="px-warn flex items-start gap-3 p-3 text-[15px] leading-6 text-ink md:p-4" data-testid="review-banner-advisory">
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

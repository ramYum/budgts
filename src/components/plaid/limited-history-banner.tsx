import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { loadLimitedHistoryMessages } from "@/lib/plaid/limited-history";
import { Icon } from "@/components/icon";

/**
 * Owner-facing advisory when a Plaid connection's initial backfill fell
 * short of the 90-day window Budgts requests at Link time (see
 * history-coverage.ts) — an institution-side limitation, not something
 * Budgts can fetch its way around, so the right move is telling the user
 * plainly rather than leaving their budget picture silently incomplete for
 * dates before they connected.
 *
 * Activity-tab only (design ask 2026-09-14) — that's where a data gap
 * actually shows up as missing rows, unlike Home's aggregate tiles. Small,
 * red (negative/attention) tag; stays shown, no auto-dismiss. The reads and
 * the per-Item evaluation live in `loadLimitedHistoryMessages`, shared with
 * the native app's GET /api/mobile/activity.
 */
export async function LimitedHistoryBanner() {
  if (!plaidUiEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;

  const messages = await loadLimitedHistoryMessages(await createClient());
  if (messages.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {messages.map((m, i) => (
        <div key={i} data-testid="limited-history-banner" className="px-warn flex items-start gap-2 px-2 py-1.5 text-sm leading-5 text-ink">
          <Icon name="warning" className="-my-0.5 text-warn" />
          <p>{m}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The Activity screen's limited-history advisory: when a Plaid connection's initial backfill fell short of the 90-day
 * window Budgts requests at Link time (see history-coverage.ts), an institution-side limitation, tell the user plainly
 * rather than leaving their budget picture silently incomplete for dates before they connected. Evaluated per Plaid Item
 * using the earliest transaction across all of that item's mapped accounts.
 *
 * Shared by the web `<LimitedHistoryBanner>` and the native `GET /api/mobile/activity` (moved out of the component,
 * 2026-09-29, Stage 2B). Framework-free; the caller supplies the user's Supabase client (RLS scopes every query).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLimitedHistoryMessages } from "@/lib/plaid/history-coverage";

/**
 * Each account's earliest live bank transaction date (accounts with none are
 * absent). One ordered `LIMIT 1` per account, in parallel — never a fetch of
 * the account's whole history: that used to run on every Activity view and,
 * unordered past PostgREST's 1000-row cap, could return the wrong "earliest"
 * for a heavy account (perf incident, 2026-09-25).
 */
export async function earliestTxnByAccount(
  supabase: Pick<SupabaseClient, "from">,
  accountIds: string[],
): Promise<Map<string, string>> {
  const rows = await Promise.all(
    accountIds.map(async (id) => {
      const { data } = await supabase
        .from("transactions")
        .select("occurred_at")
        .eq("plaid_account_id", id)
        .eq("source", "bank")
        .is("removed_at", null)
        .order("occurred_at", { ascending: true })
        .limit(1);
      return [id, (data as { occurred_at: string }[] | null)?.[0]?.occurred_at ?? null] as const;
    }),
  );
  const out = new Map<string, string>();
  for (const [id, earliest] of rows) if (earliest) out.set(id, earliest);
  return out;
}

/** The advisory lines to show (empty when every active connection has its full history, or there is none). */
export async function loadLimitedHistoryMessages(supabase: SupabaseClient): Promise<string[]> {
  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabase.from("plaid_items").select("id, created_at, institution_name").eq("status", "active").limit(100),
    supabase.from("plaid_accounts").select("id, plaid_item_id").not("account_id", "is", null).limit(1000),
  ]);
  if (!items || items.length === 0) return [];

  const accountsByItem = new Map<string, string[]>();
  for (const a of (accounts ?? []) as { id: string; plaid_item_id: string }[]) {
    const list = accountsByItem.get(a.plaid_item_id) ?? [];
    list.push(a.id);
    accountsByItem.set(a.plaid_item_id, list);
  }

  const allMappedAccountIds = [...accountsByItem.values()].flat();
  if (allMappedAccountIds.length === 0) return [];

  const earliestByAccount = await earliestTxnByAccount(supabase, allMappedAccountIds);

  return buildLimitedHistoryMessages(
    (items as { id: string; created_at: string; institution_name: string | null }[]).map((item) => {
      const accountIds = accountsByItem.get(item.id) ?? [];
      const earliest = accountIds
        .map((id) => earliestByAccount.get(id))
        .filter((d): d is string => d != null)
        .sort()[0];
      return {
        institutionName: item.institution_name,
        connectedAt: item.created_at,
        earliestTxnAt: earliest ?? null,
      };
    }),
  );
}

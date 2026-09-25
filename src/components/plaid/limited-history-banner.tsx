import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { buildLimitedHistoryMessages } from "@/lib/plaid/history-coverage";

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
 * red (negative/attention) tag; stays shown, no auto-dismiss. Evaluated per
 * Plaid Item (not per account) using the earliest transaction across all
 * of that item's mapped accounts — every real-world case seen so far was
 * all-or-nothing per item.
 */
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Each account's earliest live bank transaction date (accounts with none are
 * absent). One ordered `LIMIT 1` per account, in parallel — never a fetch of
 * the account's whole history: that used to run on every Activity view and,
 * unordered past PostgREST's 1000-row cap, could return the wrong "earliest"
 * for a heavy account (perf incident, 2026-09-25).
 */
export async function earliestTxnByAccount(
  supabase: ServerSupabase,
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
      return [id, data?.[0]?.occurred_at ?? null] as const;
    }),
  );
  const out = new Map<string, string>();
  for (const [id, earliest] of rows) if (earliest) out.set(id, earliest);
  return out;
}

export async function LimitedHistoryBanner() {
  if (!plaidUiEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();

  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabase.from("plaid_items").select("id, created_at, institution_name").eq("status", "active"),
    supabase.from("plaid_accounts").select("id, plaid_item_id").not("account_id", "is", null),
  ]);
  if (!items || items.length === 0) return null;

  const accountsByItem = new Map<string, string[]>();
  for (const a of accounts ?? []) {
    const list = accountsByItem.get(a.plaid_item_id) ?? [];
    list.push(a.id);
    accountsByItem.set(a.plaid_item_id, list);
  }

  const allMappedAccountIds = [...accountsByItem.values()].flat();
  if (allMappedAccountIds.length === 0) return null;

  const earliestByAccount = await earliestTxnByAccount(supabase, allMappedAccountIds);

  const messages = buildLimitedHistoryMessages(
    items.map((item) => {
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
  if (messages.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {messages.map((m, i) => (
        <div key={i} className="rounded-md border border-neg/40 bg-neg/5 px-2.5 py-1.5 text-xs text-neg">
          <p>{m}</p>
        </div>
      ))}
    </div>
  );
}

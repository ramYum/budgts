/**
 * The Accounts screen's data ("What money do I currently have?", design spec §31): accounts grouped the way they arrive,
 * under the bank that links them, then the ones kept by hand, then archived, each with how many transactions it holds this
 * month (the rows the Activity list shows for it). One implementation, used by the web Accounts page and the native
 * `GET /api/mobile/accounts/overview` (moved verbatim out of the page, 2026-09-29, Stage 2B). "This month" is the user's
 * own, from their time zone. Framework-free; the caller supplies the user's Supabase client (RLS scopes every query).
 * A failed read throws: an account list missing rows would hide money the user holds.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountType } from "@/lib/accounts/account-types";
import { currentMonthKey } from "@/lib/budget/month";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export type OverviewAccount = {
  id: string;
  name: string;
  type: AccountType;
  is_archived: boolean;
  /** the bank's last four, for a linked account */
  mask: string | null;
  /** transactions this month (the Activity list's count for the account) */
  txnCount: number;
};

export type OverviewGroup = {
  key: string;
  title: string;
  /** a linked bank's connection state; none for accounts added by hand */
  status?: "connected" | "attention";
  accounts: OverviewAccount[];
};

export type AccountsOverview = { month: string; groups: OverviewGroup[]; archived: OverviewAccount[] };

const NEEDS_ATTENTION = new Set(["login_required", "pending_expiration", "revoked", "error"]);

type LinkRow = {
  account_id: string | null;
  mask: string | null;
  plaid_item: { id: string; institution_name: string | null; status: string } | null;
};

export async function loadAccountsOverview(
  supabase: SupabaseClient,
  input: { timeZone: string; plaidEnabled: boolean },
): Promise<AccountsOverview> {
  const plaidOn = input.plaidEnabled;
  const month = currentMonthKey(input.timeZone);
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y!, m!, 1)).toISOString();

  const [accountsRes, linksRes, monthRows] = await Promise.all([
    supabase.from("accounts").select("id, name, type, is_archived").order("name").limit(1000),
    plaidOn
      ? supabase
          .from("plaid_accounts")
          .select("account_id, mask, plaid_item:plaid_items(id, institution_name, status)")
          .not("account_id", "is", null)
          .limit(1000)
          .returns<LinkRow[]>()
      : Promise.resolve({ data: [] as LinkRow[], error: null }),
    // fetchAllRows, not a bare await: a heavy bank feed can pass PostgREST's
    // 1000-row cap within a month (fetch-all-rows.ts). Same row filters as
    // the Activity list, so the counts match what it shows.
    fetchAllRows<{ account_id: string }>((from, to, count) => {
      let q = supabase
        .from("transactions")
        .select("account_id", { count })
        .gte("occurred_at", start)
        .lt("occurred_at", end)
        .order("id", { ascending: true })
        .range(from, to);
      if (plaidOn) q = q.is("removed_at", null).is("duplicate_of_id", null);
      return q;
    }),
  ]);
  if (accountsRes.error || linksRes.error) throw new Error("accounts_read_failed");

  const counts = new Map<string, number>();
  for (const r of monthRows) counts.set(r.account_id, (counts.get(r.account_id) ?? 0) + 1);
  const links = (linksRes.data ?? []) as LinkRow[];
  const linkByAccount = new Map(links.filter((l) => l.account_id).map((l) => [l.account_id!, l]));

  const toItem = (a: { id: string; name: string; type: string; is_archived: boolean }): OverviewAccount => ({
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    is_archived: a.is_archived,
    mask: linkByAccount.get(a.id)?.mask ?? null,
    txnCount: counts.get(a.id) ?? 0,
  });

  const banks = new Map<string, OverviewGroup>();
  const byHand: OverviewAccount[] = [];
  const archived: OverviewAccount[] = [];
  for (const a of (accountsRes.data ?? []) as { id: string; name: string; type: string; is_archived: boolean }[]) {
    const item = toItem(a);
    if (a.is_archived) {
      archived.push(item);
      continue;
    }
    const bank = linkByAccount.get(a.id)?.plaid_item;
    if (!bank) {
      byHand.push(item);
      continue;
    }
    const group = banks.get(bank.id) ?? {
      key: bank.id,
      // the Sandbox seed names its bank "… (Sandbox)"; the heading needs only the name
      title: `Linked · ${(bank.institution_name ?? "Bank").replace(/\s*\(Sandbox\)$/i, "")}`,
      status: NEEDS_ATTENTION.has(bank.status) ? ("attention" as const) : ("connected" as const),
      accounts: [],
    };
    group.accounts.push(item);
    banks.set(bank.id, group);
  }
  const groups: OverviewGroup[] = [
    ...banks.values(),
    ...(byHand.length > 0 ? [{ key: "by-hand", title: "Added by hand", accounts: byHand }] : []),
  ];

  return { month, groups, archived };
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { currentMonthKey } from "@/lib/budget/month";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import type { AccountType } from "@/lib/accounts/account-types";
import { PageHeader } from "@/components/page-header";
import {
  AccountManager,
  AddAccountButton,
  type AccountGroup,
  type AccountItem,
} from "@/components/account-manager";

export const metadata: Metadata = { title: "Accounts" };

const NEEDS_ATTENTION = new Set(["login_required", "pending_expiration", "revoked", "error"]);

type LinkRow = {
  account_id: string | null;
  mask: string | null;
  plaid_item: { id: string; institution_name: string | null; status: string } | null;
};

/** "What money do I currently have?" (design spec §31). Accounts grouped the
 * way they arrive: under the bank that links them, then the ones kept by
 * hand, then archived. Each shows how many transactions it holds this month
 * (the rows the Activity list shows for it). */
export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();
  const plaidOn = plaidUiEnabled();

  const month = currentMonthKey();
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y!, m!, 1)).toISOString();

  const [{ data: accounts }, { data: links }, monthRows] = await Promise.all([
    supabase.from("accounts").select("id, name, type, is_archived").order("name"),
    plaidOn
      ? supabase
          .from("plaid_accounts")
          .select("account_id, mask, plaid_item:plaid_items(id, institution_name, status)")
          .not("account_id", "is", null)
          .returns<LinkRow[]>()
      : Promise.resolve({ data: [] as LinkRow[] }),
    // fetchAllRows, not a bare await: a heavy bank feed can pass PostgREST's
    // 1000-row cap within a month (fetch-all-rows.ts). Same row filters as
    // the Activity list, so the counts match what it shows.
    fetchAllRows((from, to, count) => {
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

  const counts = new Map<string, number>();
  for (const r of monthRows) counts.set(r.account_id, (counts.get(r.account_id) ?? 0) + 1);
  const linkByAccount = new Map((links ?? []).filter((l) => l.account_id).map((l) => [l.account_id!, l]));

  const toItem = (a: { id: string; name: string; type: string; is_archived: boolean }): AccountItem => ({
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    is_archived: a.is_archived,
    mask: linkByAccount.get(a.id)?.mask ?? null,
    txnCount: counts.get(a.id) ?? 0,
  });

  const banks = new Map<string, AccountGroup>();
  const byHand: AccountItem[] = [];
  const archived: AccountItem[] = [];
  for (const a of accounts ?? []) {
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
  const groups: AccountGroup[] = [
    ...banks.values(),
    ...(byHand.length > 0 ? [{ key: "by-hand", title: "Added by hand", accounts: byHand }] : []),
  ];

  return (
    <>
      <PageHeader title="Accounts" back="/more" backOnDesktop={false} action={<AddAccountButton />} />
      <div className="space-y-6 md:max-w-[720px]">
        <p className="max-w-xl text-[15px] leading-6 text-muted">
          Accounts hold your transactions. Linked ones update on their own; add cash or anything else by hand.
        </p>
        <AccountManager groups={groups} archived={archived} />
      </div>
    </>
  );
}

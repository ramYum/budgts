/**
 * The connected-banks data load — one implementation behind the web `BankConnections` server component
 * (`src/components/plaid/bank-connections.tsx`) and the native `GET /api/mobile/plaid/banks` route. Moved out of the
 * component unchanged (Stage 0 port). RLS-scoped through the caller's own Supabase client. Returns null when the Plaid
 * tables aren't present on this deployment (pre-migration-0004 environments), the self-gating `BankConnections` relies on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export type ConnectedBankAccount = {
  rowId: string;
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  /** Plaid's own account type/subtype — only used to guess a default name/type
   * when quick-connecting a never-mapped account (see ConnectToggle). */
  type: string | null;
  subtype: string | null;
  linkState: "mapped" | "ignored" | "unmapped";
  mappedAccountName: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  excludedFromCalculations: boolean;
  /** Rows still held pending sign-convention verification (design 2026-09-12
   *  North Star §2) — never confirmed, so never counted anywhere, until this
   *  is 0. Drives the "We're checking this account's transaction format"
   *  notice; must never be silently omitted. */
  pendingSignCheckCount: number;
  /** One held transaction to ask the user about while `pendingSignCheckCount > 0` (design: 2026-10-01 card payments
   *  §5): "Was this money going out or coming in?" The answer resolves the account. The most recent held row, so
   *  the user is likely to remember it; amount in minor units, unsigned (the sign is what is being asked). */
  signCheckSample: SignCheckSample | null;
  /** Set when the user resolved this account by answering the question (design: 2026-10-01 card payments §5a), so
   *  Connected banks can offer "Change answer". `sample` is the transaction to ask about again: the one answered
   *  about, or the account's most recent one if that is gone; null when the account has none. */
  signAnswer: { answeredAt: string; sample: SignCheckSample | null } | null;
  /** Set for an imported account the sync resolved from evidence, with no answer (design: 2026-10-01 card payments
   *  §5b): Connected banks offers "Amounts on this account look reversed?", which asks the same question about
   *  `sample` (the account's most recent transaction) and changes the account if the answer disagrees. */
  directionReview: { sample: SignCheckSample } | null;
};

export type SignCheckSample = {
  transactionId: string;
  description: string;
  occurredAt: string;
  amount: number;
  /** The account's currency (Plaid's `iso_currency_code`), for showing the amount. */
  currency: string;
};

export type MappableAccount = {
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  currentBalance: number | null;
  isoCurrencyCode: string | null;
};

export type ConnectedBank = {
  id: string;
  itemId: string;
  institutionName: string | null;
  status: "active" | "login_required" | "pending_expiration" | "revoked" | "error";
  lastSyncedAt: string | null;
  accounts: ConnectedBankAccount[];
  unmappedAccounts: MappableAccount[];
};

export type ConnectedBanksData = {
  banks: ConnectedBank[];
  /** The user's active Budgts accounts (id, name): the mapping choices. */
  budgtsAccounts: { id: string; name: string }[];
};

type PlaidItemRow = {
  id: string;
  item_id: string;
  institution_name: string | null;
  status: ConnectedBank["status"];
  last_synced_at: string | null;
};

type PlaidAccountRow = {
  id: string;
  plaid_item_id: string;
  plaid_account_id: string;
  name: string | null;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  iso_currency_code: string | null;
  link_state: "mapped" | "ignored" | "unmapped";
  account_id: string | null;
  needs_review: boolean;
  review_reason: string | null;
  excluded_from_calculations: boolean;
  sign_convention: "unknown" | "standard" | "inverted";
};

type SampleRow = { id: string; description: string; occurred_at: string; amount: number };

const toSample = (row: SampleRow): Omit<SignCheckSample, "currency"> => ({
  transactionId: row.id,
  description: row.description,
  occurredAt: row.occurred_at,
  amount: Number(row.amount),
});

export async function loadConnectedBanks(supabase: SupabaseClient): Promise<ConnectedBanksData | null> {
  const { data: itemsData, error: itemsErr } = await supabase
    .from("plaid_items")
    .select("id, item_id, institution_name, status, last_synced_at")
    .order("created_at", { ascending: true });
  if (itemsErr) return null; // tables not present on this deployment

  const items = (itemsData ?? []) as PlaidItemRow[];

  const [{ data: acctData }, { data: budgtsAcctData }, pendingSignRows, { data: answerData }] = await Promise.all([
    supabase
      .from("plaid_accounts")
      .select(
        "id, plaid_item_id, plaid_account_id, name, official_name, mask, type, subtype, current_balance, iso_currency_code, link_state, account_id, needs_review, review_reason, excluded_from_calculations, sign_convention",
      ),
    supabase.from("accounts").select("id, name").eq("is_archived", false).order("name"),
    // Design: 2026-09-12 North Star §2 — while unresolved, the UI must say so
    // ("We're checking this account's transaction format") rather than let
    // transactions silently vanish from every total. IDs only, tallied below —
    // an aggregate count isn't available through PostgREST without an RPC.
    // fetchAllRows, not a bare await: this exact account can hold thousands of
    // pending rows (a heavy Plaid feed's full initial import) — an unbounded
    // `.select()` silently caps at PostgREST's default 1000, which would
    // undercount the very notice this query exists to make accurate (see
    // fetch-all-rows.ts for the confirmed real-world case that pattern fixed).
    fetchAllRows<{ plaid_account_id: string }>((from, to, count) =>
      supabase
        .from("transactions")
        .select("plaid_account_id", { count })
        .eq("status", "pending_review")
        .eq("pending_reason", "sign_convention_unknown")
        .not("plaid_account_id", "is", null)
        .order("id")
        .range(from, to),
    ),
    // The user's answers (migration 0025; absent on an older deployment, which reads as "none"). Newest first.
    supabase.from("plaid_sign_answers").select("plaid_account_id, sample_transaction_id, created_at").order("created_at", {
      ascending: false,
    }),
  ]);

  const plaidAccounts = (acctData ?? []) as PlaidAccountRow[];
  const budgtsAccounts = (budgtsAcctData ?? []) as { id: string; name: string }[];
  const accountName = new Map(budgtsAccounts.map((a) => [a.id, a.name]));
  const pendingSignCheckCounts = new Map<string, number>();
  for (const r of pendingSignRows) {
    pendingSignCheckCounts.set(r.plaid_account_id, (pendingSignCheckCounts.get(r.plaid_account_id) ?? 0) + 1);
  }

  // One bounded read per account still being checked (a handful at most): the question's sample transaction.
  const heldAccountIds = [...pendingSignCheckCounts.keys()];
  const samples = await Promise.all(
    heldAccountIds.map((id) =>
      supabase
        .from("transactions")
        .select("id, description, occurred_at, amount")
        .eq("plaid_account_id", id)
        .eq("status", "pending_review")
        .eq("pending_reason", "sign_convention_unknown")
        .order("occurred_at", { ascending: false })
        .order("id")
        .limit(1),
    ),
  );
  const sampleByAccount = new Map<string, Omit<SignCheckSample, "currency">>();
  heldAccountIds.forEach((id, i) => {
    const row = (samples[i].data ?? [])[0] as SampleRow | undefined;
    if (row?.id) sampleByAccount.set(id, toSample(row));
  });

  // "Change answer": the latest answer per account the user resolved by answering, and its transaction to re-ask.
  const resolved = new Set(plaidAccounts.filter((a) => a.sign_convention !== "unknown").map((a) => a.id));
  const latestAnswer = new Map<string, { sampleId: string | null; at: string }>();
  for (const r of (answerData ?? []) as { plaid_account_id: string; sample_transaction_id: string | null; created_at: string }[]) {
    if (resolved.has(r.plaid_account_id) && !latestAnswer.has(r.plaid_account_id)) {
      latestAnswer.set(r.plaid_account_id, { sampleId: r.sample_transaction_id, at: r.created_at });
    }
  }
  const answeredIds = [...latestAnswer.keys()];
  // Evidence-resolved imported accounts with no answer: their transaction to ask about is their most recent one.
  const reviewIds = plaidAccounts
    .filter((a) => resolved.has(a.id) && a.link_state === "mapped" && !latestAnswer.has(a.id))
    .map((a) => a.id);
  const recentIds = [...answeredIds, ...reviewIds];
  const answeredSampleIds = answeredIds.map((id) => latestAnswer.get(id)!.sampleId).filter((x): x is string => x != null);
  const [answeredSamples, ...recentSamples] = await Promise.all([
    answeredSampleIds.length > 0
      ? supabase.from("transactions").select("id, description, occurred_at, amount, plaid_account_id").in("id", answeredSampleIds).is("removed_at", null)
      : Promise.resolve({ data: [] as unknown[] }),
    ...recentIds.map((id) =>
      supabase
        .from("transactions")
        .select("id, description, occurred_at, amount")
        .eq("plaid_account_id", id)
        .is("removed_at", null)
        .order("occurred_at", { ascending: false })
        .order("id")
        .limit(1),
    ),
  ]);
  const answeredSampleById = new Map(((answeredSamples.data ?? []) as SampleRow[]).filter((r) => r?.id).map((r) => [r.id, r]));
  const answerByAccount = new Map<string, { answeredAt: string; sample: Omit<SignCheckSample, "currency"> | null }>();
  answeredIds.forEach((id, i) => {
    const { sampleId, at } = latestAnswer.get(id)!;
    const answeredRow = sampleId ? answeredSampleById.get(sampleId) : undefined;
    const recent = ((recentSamples[i]?.data ?? []) as SampleRow[])[0];
    const row = answeredRow ?? (recent?.id ? recent : undefined);
    answerByAccount.set(id, { answeredAt: at, sample: row ? toSample(row) : null });
  });
  const reviewSampleByAccount = new Map<string, Omit<SignCheckSample, "currency">>();
  reviewIds.forEach((id, i) => {
    const recent = ((recentSamples[answeredIds.length + i]?.data ?? []) as SampleRow[])[0];
    if (recent?.id) reviewSampleByAccount.set(id, toSample(recent));
  });

  const banks: ConnectedBank[] = items.map((item) => {
    const rows = plaidAccounts.filter((a) => a.plaid_item_id === item.id);
    const accounts: ConnectedBankAccount[] = rows.map((a) => ({
      rowId: a.id,
      plaidAccountId: a.plaid_account_id,
      name: a.name,
      officialName: a.official_name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      linkState: a.link_state,
      mappedAccountName: a.account_id ? (accountName.get(a.account_id) ?? null) : null,
      needsReview: a.needs_review,
      reviewReason: a.review_reason,
      excludedFromCalculations: a.excluded_from_calculations,
      pendingSignCheckCount: pendingSignCheckCounts.get(a.id) ?? 0,
      signCheckSample: (() => {
        const sample = sampleByAccount.get(a.id);
        return sample ? { ...sample, currency: a.iso_currency_code ?? "USD" } : null;
      })(),
      signAnswer: (() => {
        const ans = answerByAccount.get(a.id);
        if (!ans) return null;
        return {
          answeredAt: ans.answeredAt,
          sample: ans.sample ? { ...ans.sample, currency: a.iso_currency_code ?? "USD" } : null,
        };
      })(),
      directionReview: (() => {
        const sample = reviewSampleByAccount.get(a.id);
        return sample ? { sample: { ...sample, currency: a.iso_currency_code ?? "USD" } } : null;
      })(),
    }));
    const unmappedAccounts: MappableAccount[] = rows
      .filter((a) => a.link_state === "unmapped")
      .map((a) => ({
        plaidAccountId: a.plaid_account_id,
        name: a.name,
        officialName: a.official_name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        currentBalance: a.current_balance,
        isoCurrencyCode: a.iso_currency_code,
      }));
    return {
      id: item.id,
      itemId: item.item_id,
      institutionName: item.institution_name,
      status: item.status,
      lastSyncedAt: item.last_synced_at,
      accounts,
      unmappedAccounts,
    };
  });

  return { banks, budgtsAccounts };
}

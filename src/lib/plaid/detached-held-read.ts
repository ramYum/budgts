/**
 * The read behind "From removed banks" on Connected banks (design: docs/specs/2026-10-01-card-payments-design.md §5c):
 * held rows a disconnected bank left behind, grouped for the money-direction question, and the groups already answered
 * (for "Change answer"). RLS-scoped through the caller's own Supabase client; shared by the web page and the native
 * `GET /api/mobile/plaid/banks`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import type { SignCheckSample } from "./connected-banks-read";
import {
  detachedGroupKey,
  groupDetachedHeld,
  latestDetachedAnswers,
  type DetachedHeldGroup,
  type DetachedHeldRow,
} from "./detached-held";

export type DetachedAnsweredGroup = {
  accountId: string;
  accountName: string;
  originRef: string;
  answeredAt: string;
  /** The transaction to ask about again: the one answered about, or the group's most recent one if that is gone. */
  sample: SignCheckSample;
};

export type DetachedHeldData = { groups: DetachedHeldGroup[]; answered: DetachedAnsweredGroup[] };

type Row = {
  id: string;
  account_id: string;
  description: string;
  occurred_at: string;
  amount: number;
  origin: string | null;
  currency: string | null;
  account: { name: string } | { name: string }[] | null;
};

const COLUMNS = "id, account_id, description, occurred_at, amount, origin:raw->>account_id, currency:raw->>iso_currency_code, account:accounts(name)";

const nameOf = (r: Row) => (Array.isArray(r.account) ? r.account[0]?.name : r.account?.name) ?? "Account";

const toRow = (r: Row): DetachedHeldRow => ({
  id: r.id,
  accountId: r.account_id,
  accountName: nameOf(r),
  originRef: r.origin,
  description: r.description,
  occurredAt: r.occurred_at,
  amount: Number(r.amount),
  currency: r.currency ?? "USD",
});

export async function loadDetachedHeld(supabase: SupabaseClient): Promise<DetachedHeldData> {
  const [heldRows, { data: answerData, error: answerErr }] = await Promise.all([
    // Every held, live, detached bank row (fetchAllRows: a heavy feed disconnected mid-check can leave thousands).
    fetchAllRows<Row>((from, to, count) =>
      supabase
        .from("transactions")
        .select(COLUMNS, { count })
        .eq("source", "bank")
        .is("plaid_account_id", null)
        .eq("status", "pending_review")
        .eq("pending_reason", "sign_convention_unknown")
        .is("removed_at", null)
        .order("id")
        .range(from, to),
    ),
    // Absent before migration 0028: reads as nothing answered, which is true there.
    supabase.from("detached_sign_answers").select("account_id, origin_account_ref, sample_transaction_id, created_at"),
  ]);
  const groups = groupDetachedHeld(heldRows.map(toRow));

  const answers = answerErr
    ? []
    : ((answerData ?? []) as { account_id: string; origin_account_ref: string; sample_transaction_id: string | null; created_at: string }[]);
  const latest = latestDetachedAnswers(
    answers.map((a) => ({ accountId: a.account_id, originRef: a.origin_account_ref, sampleTransactionId: a.sample_transaction_id, createdAt: a.created_at })),
    new Set(groups.map((g) => detachedGroupKey(g.accountId, g.originRef))),
  );

  // One or two bounded reads per answered group (a handful at most): its transaction to re-ask about, still detached.
  const answered = await Promise.all(
    latest.map(async (a): Promise<DetachedAnsweredGroup | null> => {
      const inGroup = () =>
        supabase
          .from("transactions")
          .select(COLUMNS)
          .eq("account_id", a.accountId)
          .eq("source", "bank")
          .is("plaid_account_id", null)
          .is("removed_at", null)
          .eq("raw->>account_id", a.originRef);
      let row: Row | undefined;
      if (a.sampleTransactionId) {
        const { data } = await inGroup().eq("id", a.sampleTransactionId).limit(1);
        row = ((data ?? []) as Row[])[0];
      }
      if (!row?.id) {
        const { data } = await inGroup().order("occurred_at", { ascending: false }).order("id").limit(1);
        row = ((data ?? []) as Row[])[0];
      }
      if (!row?.id) return null;
      const r = toRow(row);
      return {
        accountId: a.accountId,
        accountName: r.accountName,
        originRef: a.originRef,
        answeredAt: a.answeredAt,
        sample: { transactionId: r.id, description: r.description, occurredAt: r.occurredAt, amount: r.amount, currency: r.currency },
      };
    }),
  );
  return { groups, answered: answered.filter((x): x is DetachedAnsweredGroup => x !== null) };
}

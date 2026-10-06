import { describe, expect, it } from "vitest";
import { loadDetachedHeld } from "./detached-held-read";

type Answer = { data: unknown; error?: { message: string } | null };

/** Per-table queue of answers, in call order; records every builder call. */
function fakeSupabase(tables: Record<string, Answer[]>) {
  const calls: Record<string, unknown[][][]> = {};
  const supabase = {
    from: (t: string) => {
      const c: unknown[][] = [];
      (calls[t] ??= []).push(c);
      const answer = (tables[t] ?? []).shift() ?? { data: [] };
      const q: unknown = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: answer.data, error: answer.error ?? null, count: null }).then(resolve);
            }
            return (...args: unknown[]) => {
              c.push([String(prop), ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  return { supabase: supabase as never, calls };
}

const held = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  account_id: "acct-1",
  description: "OpenAI",
  occurred_at: "2026-09-14T00:00:00Z",
  amount: 848,
  origin: "feed-old",
  currency: "USD",
  raw_amount: 8.48,
  account: { name: "SoFi Checking ••5805" },
  ...over,
});

describe("loadDetachedHeld", () => {
  it("reads only held, live, detached bank rows and groups them per account and original feed", async () => {
    const { supabase, calls } = fakeSupabase({
      transactions: [{ data: [held(), held({ id: "t2", occurred_at: "2026-09-15T00:00:00Z", description: "Anthropic", amount: 2120 })] }],
      detached_sign_answers: [{ data: [] }],
    });
    const out = await loadDetachedHeld(supabase);
    expect(out!.groups).toEqual([
      {
        accountId: "acct-1",
        accountName: "SoFi Checking ••5805",
        originRef: "feed-old",
        count: 2,
        sample: { transactionId: "t2", description: "Anthropic", occurredAt: "2026-09-15T00:00:00Z", amount: 2120, currency: "USD" },
      },
    ]);
    const q = calls.transactions![0]!;
    expect(q).toContainEqual(["eq", "source", "bank"]);
    expect(q).toContainEqual(["is", "plaid_account_id", null]);
    expect(q).toContainEqual(["eq", "status", "pending_review"]);
    expect(q).toContainEqual(["eq", "pending_reason", "sign_convention_unknown"]);
    expect(q).toContainEqual(["is", "removed_at", null]);
    expect(out!.answered).toEqual([]);
  });

  it("offers Change answer for an answered group with nothing left held, asking about the answered transaction", async () => {
    const { supabase } = fakeSupabase({
      transactions: [
        { data: [] }, // nothing held
        { data: [held({ id: "s1", origin: "feed-old" })] }, // the answered sample, still detached and live
      ],
      detached_sign_answers: [
        { data: [{ account_id: "acct-1", origin_account_ref: "feed-old", sample_transaction_id: "s1", created_at: "2026-10-05T00:00:00Z" }] },
      ],
    });
    const out = await loadDetachedHeld(supabase);
    expect(out!.groups).toEqual([]);
    expect(out!.answered).toEqual([
      {
        accountId: "acct-1",
        accountName: "SoFi Checking ••5805",
        originRef: "feed-old",
        answeredAt: "2026-10-05T00:00:00Z",
        sample: { transactionId: "s1", description: "OpenAI", occurredAt: "2026-09-14T00:00:00Z", amount: 848, currency: "USD" },
      },
    ]);
  });

  it("drops an answered group whose transactions were all re-attached by a reconnect or removed", async () => {
    const { supabase } = fakeSupabase({
      transactions: [{ data: [] }, { data: [] }, { data: [] }],
      detached_sign_answers: [
        { data: [{ account_id: "acct-1", origin_account_ref: "feed-old", sample_transaction_id: "s1", created_at: "2026-10-05T00:00:00Z" }] },
      ],
    });
    expect((await loadDetachedHeld(supabase))!.answered).toEqual([]);
  });

  it("returns null (couldn't load) instead of throwing when the held-row read fails", async () => {
    const { supabase } = fakeSupabase({
      transactions: [{ data: null, error: { message: "statement timeout" } }],
      detached_sign_answers: [{ data: [] }],
    });
    expect(await loadDetachedHeld(supabase)).toBeNull();
  });

  it("re-asks a row-only group (no feed in its payload) about that row", async () => {
    const { supabase, calls } = fakeSupabase({
      transactions: [{ data: [] }, { data: [held({ id: "s1", origin: null })] }],
      detached_sign_answers: [
        { data: [{ account_id: "acct-1", origin_account_ref: "row:s1", sample_transaction_id: "s1", created_at: "2026-10-05T00:00:00Z" }] },
      ],
    });
    const out = await loadDetachedHeld(supabase);
    expect(out?.answered.map((a) => [a.originRef, a.sample.transactionId])).toEqual([["row:s1", "s1"]]);
    expect(calls.transactions![1]).not.toContainEqual(["eq", "raw->>account_id", "row:s1"]);
  });

  it("reads as nothing answered where migration 0028 has not run", async () => {
    const { supabase } = fakeSupabase({
      transactions: [{ data: [held()] }],
      detached_sign_answers: [{ data: null, error: { message: 'relation "detached_sign_answers" does not exist' } }],
    });
    const out = await loadDetachedHeld(supabase);
    expect(out!.groups).toHaveLength(1);
    expect(out!.answered).toEqual([]);
  });
});

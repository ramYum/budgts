import { describe, expect, it } from "vitest";
import { groupDetachedHeld, latestDetachedAnswers, type DetachedHeldRow } from "./detached-held";

const row = (over: Partial<DetachedHeldRow> = {}): DetachedHeldRow => ({
  id: "t1",
  accountId: "acct-1",
  accountName: "SoFi Checking ••5805",
  originRef: "plaid-acct-old",
  description: "OpenAI",
  occurredAt: "2026-09-14T00:00:00Z",
  amount: 848,
  currency: "USD",
  rawAmount: 8.48,
  ...over,
});

describe("groupDetachedHeld", () => {
  it("groups by Budgts account and the original bank feed, counts, and samples the most recent row", () => {
    const groups = groupDetachedHeld([
      row({ id: "a", occurredAt: "2026-09-14T00:00:00Z" }),
      row({ id: "b", occurredAt: "2026-09-15T00:00:00Z", description: "Anthropic", amount: 2120 }),
      row({ id: "c", occurredAt: "2026-09-15T00:00:00Z", description: "Evo Fuel & Market", amount: 1377 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ accountId: "acct-1", accountName: "SoFi Checking ••5805", count: 3 });
    // newest date first, then id order: the same tie-break as Connected banks' live question
    expect(groups[0]!.sample).toEqual({
      transactionId: "b",
      description: "Anthropic",
      occurredAt: "2026-09-15T00:00:00Z",
      amount: 2120,
      currency: "USD",
    });
  });

  it("never pools two bank feeds that fed the same Budgts account (each may read signs differently)", () => {
    const groups = groupDetachedHeld([row({ id: "a", originRef: "feed-1" }), row({ id: "b", originRef: "feed-2" })]);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
    expect(new Set(groups.map((g) => g.sample.transactionId))).toEqual(new Set(["a", "b"]));
  });

  it("gives each row with no original feed its own group (its own question, never pooled, never dropped)", () => {
    const groups = groupDetachedHeld([row({ id: "a", originRef: null }), row({ id: "b", originRef: null })]);
    expect(groups.map((g) => [g.originRef, g.count, g.sample.transactionId])).toEqual([
      ["row:a", 1, "a"],
      ["row:b", 1, "b"],
    ]);
  });

  it("never asks about a row whose raw sign is unusable when the group has a usable one", () => {
    const groups = groupDetachedHeld([
      row({ id: "new", occurredAt: "2026-09-20T00:00:00Z", rawAmount: 0 }),
      row({ id: "old", occurredAt: "2026-09-10T00:00:00Z", rawAmount: 5 }),
    ]);
    expect(groups[0]!.sample.transactionId).toBe("old");
    expect(groups[0]!.count).toBe(2);
  });

  it("orders groups by account name, then feed, deterministically", () => {
    const groups = groupDetachedHeld([
      row({ id: "z", accountId: "acct-2", accountName: "Zeta" }),
      row({ id: "a", accountId: "acct-1", accountName: "Alpha" }),
    ]);
    expect(groups.map((g) => g.accountName)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("latestDetachedAnswers", () => {
  it("keeps the newest answer per group and drops groups that still have held rows", () => {
    const answers = latestDetachedAnswers(
      [
        { accountId: "acct-1", originRef: "f1", sampleTransactionId: "s-old", createdAt: "2026-10-01T00:00:00Z" },
        { accountId: "acct-1", originRef: "f1", sampleTransactionId: "s-new", createdAt: "2026-10-02T00:00:00Z" },
        { accountId: "acct-2", originRef: "f2", sampleTransactionId: "s2", createdAt: "2026-10-01T00:00:00Z" },
      ],
      new Set(["acct-2|f2"]),
    );
    expect(answers).toEqual([{ accountId: "acct-1", originRef: "f1", sampleTransactionId: "s-new", answeredAt: "2026-10-02T00:00:00Z" }]);
  });
});

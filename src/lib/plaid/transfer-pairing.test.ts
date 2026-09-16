import { describe, expect, it } from "vitest";
import { findTransferPairs, type PairingCandidate } from "./transfer-pairing";

const DAY = "2026-09-10T12:00:00.000Z";

function c(over: Partial<PairingCandidate> & { id: string }): PairingCandidate {
  return {
    accountId: "acct-a",
    amount: 5000,
    direction: "debit",
    occurredAt: DAY,
    eventRole: null,
    isTransfer: false,
    ...over,
  };
}

describe("findTransferPairs — Tier A (link only)", () => {
  it("pairs two already-transfer-shaped legs (both isTransfer via PFC) across different accounts", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", isTransfer: true, eventRole: "TRANSFER" });
    const b = c({ id: "b", accountId: "savings", direction: "credit", isTransfer: true, eventRole: "TRANSFER" });
    const { accepted, ambiguous } = findTransferPairs([a, b]);
    expect(ambiguous).toEqual([]);
    expect(accepted).toEqual([{ tier: "A", legA: "a", legB: "b", classifyLegId: null }]);
  });

  it("pairs CARD_PAYMENT <-> CARD_PAYMENT without touching classification", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", eventRole: "CARD_PAYMENT" });
    const b = c({ id: "b", accountId: "credit-card", direction: "credit", eventRole: "CARD_PAYMENT" });
    const { accepted } = findTransferPairs([a, b]);
    expect(accepted).toEqual([{ tier: "A", legA: "a", legB: "b", classifyLegId: null }]);
  });

  it("accepts up to a 3-day gap", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", isTransfer: true, occurredAt: "2026-09-10T00:00:00.000Z" });
    const b = c({ id: "b", accountId: "savings", direction: "credit", isTransfer: true, occurredAt: "2026-09-13T00:00:00.000Z" });
    const { accepted } = findTransferPairs([a, b]);
    expect(accepted).toHaveLength(1);
  });

  it("rejects a gap wider than 3 days (no match, not ambiguous)", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", isTransfer: true, occurredAt: "2026-09-10T00:00:00.000Z" });
    const b = c({ id: "b", accountId: "savings", direction: "credit", isTransfer: true, occurredAt: "2026-09-14T00:00:01.000Z" });
    const { accepted, ambiguous } = findTransferPairs([a, b]);
    expect(accepted).toEqual([]);
    expect(ambiguous).toEqual([]);
  });
});

describe("findTransferPairs — Tier B (corrective classify + link)", () => {
  it("classifies the unresolved side and links both, when the other side is already transfer-shaped", () => {
    const shaped = c({ id: "shaped", accountId: "checking", direction: "debit", isTransfer: true, eventRole: "TRANSFER" });
    const unresolved = c({ id: "unresolved", accountId: "external-bank", direction: "credit", eventRole: null });
    const { accepted } = findTransferPairs([shaped, unresolved]);
    expect(accepted).toEqual([{ tier: "B", legA: "shaped", legB: "unresolved", classifyLegId: "unresolved" }]);
  });

  it("accepts same-day", () => {
    const shaped = c({ id: "shaped", accountId: "checking", direction: "debit", isTransfer: true, occurredAt: "2026-09-10T08:00:00.000Z" });
    const unresolved = c({ id: "unresolved", accountId: "ext", direction: "credit", eventRole: null, occurredAt: "2026-09-10T20:00:00.000Z" });
    const { accepted } = findTransferPairs([shaped, unresolved]);
    expect(accepted).toEqual([{ tier: "B", legA: "shaped", legB: "unresolved", classifyLegId: "unresolved" }]);
  });

  it("accepts the immediate next calendar day", () => {
    const shaped = c({ id: "shaped", accountId: "checking", direction: "debit", isTransfer: true, occurredAt: "2026-09-10T23:00:00.000Z" });
    const unresolved = c({ id: "unresolved", accountId: "ext", direction: "credit", eventRole: null, occurredAt: "2026-09-11T02:00:00.000Z" });
    const { accepted } = findTransferPairs([shaped, unresolved]);
    expect(accepted).toHaveLength(1);
  });

  it("does NOT reclassify a side that already has a resolved role (e.g. PURCHASE) — Tier C instead", () => {
    const shaped = c({ id: "shaped", accountId: "checking", direction: "debit", isTransfer: true });
    const resolvedPurchase = c({
      id: "purchase",
      accountId: "credit-card",
      direction: "credit",
      eventRole: "PURCHASE",
    });
    const { accepted, ambiguous } = findTransferPairs([shaped, resolvedPurchase]);
    expect(accepted).toEqual([]);
    expect(ambiguous).toHaveLength(1);
  });

  it("does not widen beyond next-day for the corrective tier (2 days apart -> no match)", () => {
    const shaped = c({ id: "shaped", accountId: "checking", direction: "debit", isTransfer: true, occurredAt: "2026-09-10T00:00:00.000Z" });
    const unresolved = c({ id: "unresolved", accountId: "ext", direction: "credit", eventRole: null, occurredAt: "2026-09-12T00:00:00.000Z" });
    const { accepted, ambiguous } = findTransferPairs([shaped, unresolved]);
    expect(accepted).toEqual([]);
    expect(ambiguous).toEqual([]);
  });
});

describe("findTransferPairs — Tier C (ambiguous, zero writes)", () => {
  it("flags multiple same-amount candidates within the window as ambiguous, no accepted pair", () => {
    // Two credit legs (same direction as each other, so they can't match
    // one another) both plausibly match the one debit leg -> genuine,
    // mutual ambiguity from the debit leg's side.
    const shaped = c({ id: "shaped", accountId: "checking", direction: "debit", isTransfer: true });
    const cand1 = c({ id: "cand1", accountId: "savings", direction: "credit", isTransfer: true });
    const cand2 = c({ id: "cand2", accountId: "other-savings", direction: "credit", isTransfer: true });
    const { accepted, ambiguous } = findTransferPairs([shaped, cand1, cand2]);
    expect(accepted).toEqual([]);
    expect(ambiguous.length).toBeGreaterThan(0);
  });

  it("never auto-accepts based on processing order alone -- mutual uniqueness is required, not just the first candidate's own one-sided view", () => {
    // Same shape as above, but id ordering (cand1 < cand2 < shaped,
    // ascending) would make "shaped" the LAST node visited by a naive
    // left-to-right pass that greedily claims as it goes. A correct
    // implementation must still catch the ambiguity rather than letting
    // cand1 silently claim "shaped" first.
    const shaped = c({ id: "shaped", accountId: "checking", direction: "debit", isTransfer: true });
    const cand1 = c({ id: "cand1", accountId: "savings", direction: "credit", isTransfer: true });
    const cand2 = c({ id: "cand2", accountId: "other-savings", direction: "credit", isTransfer: true });
    const { accepted, ambiguous } = findTransferPairs([cand1, cand2, shaped]);
    expect(accepted).toEqual([]);
    expect(ambiguous.length).toBeGreaterThan(0);
  });
});

describe("findTransferPairs — candidacy exclusions and Reject cases", () => {
  it("never matches two transactions with no transfer-shaped signal on either side (ordinary coincidence)", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", eventRole: null });
    const b = c({ id: "b", accountId: "savings", direction: "credit", eventRole: null });
    const { accepted, ambiguous } = findTransferPairs([a, b]);
    expect(accepted).toEqual([]);
    expect(ambiguous).toEqual([]);
  });

  it("never matches same-account candidates", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", isTransfer: true });
    const b = c({ id: "b", accountId: "checking", direction: "credit", isTransfer: true });
    const { accepted } = findTransferPairs([a, b]);
    expect(accepted).toEqual([]);
  });

  it("never matches same-direction candidates", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", isTransfer: true });
    const b = c({ id: "b", accountId: "savings", direction: "debit", isTransfer: true });
    const { accepted } = findTransferPairs([a, b]);
    expect(accepted).toEqual([]);
  });

  it("requires exact amount equality (off-by-one-cent rejected)", () => {
    const a = c({ id: "a", accountId: "checking", direction: "debit", isTransfer: true, amount: 5000 });
    const b = c({ id: "b", accountId: "savings", direction: "credit", isTransfer: true, amount: 5001 });
    const { accepted, ambiguous } = findTransferPairs([a, b]);
    expect(accepted).toEqual([]);
    expect(ambiguous).toEqual([]);
  });

  it("payroll (INCOME role) is never a candidate, even with a coincidentally equal outgoing amount", () => {
    const payroll = c({ id: "payroll", accountId: "checking", direction: "credit", eventRole: "INCOME", amount: 200000 });
    const outgoing = c({ id: "outgoing", accountId: "savings", direction: "debit", isTransfer: true, amount: 200000 });
    const { accepted } = findTransferPairs([payroll, outgoing]);
    expect(accepted).toEqual([]);
  });

  it("P2P_PAYMENT is never a candidate", () => {
    const p2p = c({ id: "p2p", accountId: "checking", direction: "debit", eventRole: "P2P_PAYMENT", amount: 3000 });
    const other = c({ id: "other", accountId: "savings", direction: "credit", isTransfer: true, amount: 3000 });
    const { accepted } = findTransferPairs([p2p, other]);
    expect(accepted).toEqual([]);
  });

  it("REFUND is never a candidate", () => {
    const refund = c({ id: "refund", accountId: "credit-card", direction: "credit", eventRole: "REFUND", amount: 1500 });
    const other = c({ id: "other", accountId: "checking", direction: "debit", isTransfer: true, amount: 1500 });
    const { accepted } = findTransferPairs([refund, other]);
    expect(accepted).toEqual([]);
  });
});

describe("findTransferPairs — determinism under repeated identical amounts", () => {
  it("matches a series of repeated same-amount transfers one-to-one, in stable date order, no candidate reused", () => {
    // Three weekly $50 transfers, checking -> savings, all already transfer-shaped.
    const legs: PairingCandidate[] = [];
    for (let week = 0; week < 3; week++) {
      const date = new Date(Date.UTC(2026, 8, 1 + week * 7)).toISOString();
      legs.push(c({ id: `out-${week}`, accountId: "checking", direction: "debit", isTransfer: true, occurredAt: date, amount: 5000 }));
      legs.push(c({ id: `in-${week}`, accountId: "savings", direction: "credit", isTransfer: true, occurredAt: date, amount: 5000 }));
    }
    const { accepted, ambiguous } = findTransferPairs(legs);
    expect(ambiguous).toEqual([]);
    expect(accepted).toHaveLength(3);
    // Every leg used exactly once.
    const used = accepted.flatMap((p) => [p.legA, p.legB]);
    expect(new Set(used).size).toBe(6);
    // Re-running against the same snapshot gives the identical result.
    expect(findTransferPairs(legs)).toEqual({ accepted, ambiguous });
  });
});

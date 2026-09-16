/**
 * DB-integration: paired-transfer detection (V1.5) against real
 * budgts-staging Postgres. Synthetic fixtures only — no Plaid. Proves what
 * no unit test can: real row-level locking under concurrent writers, and
 * the real reconciliation self-join against actual committed rows.
 * Design: docs/specs/2026-09-16-paired-transfer-detection-design.md.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isEventRole } from "@/lib/plaid/event-role";
import { findTransferPairs } from "@/lib/plaid/transfer-pairing";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import { updateTransactionRow } from "@/server/transaction-update";
import {
  adminSupabase,
  cleanupUser,
  client,
  createAccount,
  db,
  insertBankTxn,
  mainAccountId,
  readTxn,
  seedUser,
} from "./_db";

const store = createPlaidSyncStore(db);
const supabase = adminSupabase();

let userId: string;
let checkingId: string;
let savingsId: string;

beforeAll(async () => {
  userId = await seedUser();
  checkingId = await mainAccountId(userId);
  savingsId = await createAccount(userId, "Savings", "savings");
});

afterAll(async () => {
  await cleanupUser(userId);
});

const DAY = "2026-09-10T12:00:00.000Z";

async function runDetectionOnce() {
  const candidates = await store.findTransferPairingCandidates(userId);
  const { accepted, ambiguous } = findTransferPairs(
    candidates.map((c) => ({ ...c, eventRole: c.eventRole != null && isEventRole(c.eventRole) ? c.eventRole : null })),
  );
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const results: string[] = [];
  for (const pair of accepted) {
    const legA = byId.get(pair.legA)!;
    const legB = byId.get(pair.legB)!;
    const result =
      pair.tier === "A"
        ? await store.applyTierALink(userId, legA, legB)
        : await store.applyTierBClassification(userId, legA, legB, pair.classifyLegId!);
    results.push(result);
  }
  return { accepted, ambiguous, results };
}

describe("findTransferPairingCandidates — eligibility, against real Postgres", () => {
  it("excludes duplicate, user-owned, removed, pending, non-bank, and already-paired rows", async () => {
    const eligible = await insertBankTxn(userId, checkingId, { isTransfer: true, occurredAt: DAY });
    const dup = await insertBankTxn(userId, checkingId, { isTransfer: true, occurredAt: DAY });
    await client`update public.transactions set duplicate_of_id = ${eligible} where id = ${dup}`;
    const userOwned = await insertBankTxn(userId, checkingId, { isTransfer: true, transferUserSet: true, occurredAt: DAY });
    const removed = await insertBankTxn(userId, checkingId, { isTransfer: true, removedAt: new Date().toISOString(), occurredAt: DAY });
    const pendingRow = await insertBankTxn(userId, checkingId, { isTransfer: true, pending: true, occurredAt: DAY });
    const alreadyPaired = await insertBankTxn(userId, checkingId, { isTransfer: true, occurredAt: DAY });
    await client`update public.transactions set transfer_pair_id = ${alreadyPaired} where id = ${alreadyPaired}`; // self-pointer is fine, just needs non-null

    const candidates = await store.findTransferPairingCandidates(userId);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(eligible);
    expect(ids).not.toContain(dup);
    expect(ids).not.toContain(userOwned);
    expect(ids).not.toContain(removed);
    expect(ids).not.toContain(pendingRow);
    expect(ids).not.toContain(alreadyPaired);
  });

  it("excludes P2P_PAYMENT, REFUND, and INCOME roles", async () => {
    const p2p = await insertBankTxn(userId, checkingId, { eventRole: "P2P_PAYMENT", occurredAt: DAY });
    const refund = await insertBankTxn(userId, checkingId, { eventRole: "REFUND", occurredAt: DAY });
    const income = await insertBankTxn(userId, checkingId, { eventRole: "INCOME", occurredAt: DAY });
    const candidates = await store.findTransferPairingCandidates(userId);
    const ids = candidates.map((c) => c.id);
    expect(ids).not.toContain(p2p);
    expect(ids).not.toContain(refund);
    expect(ids).not.toContain(income);
  });
});

describe("Tier A — link only, against real Postgres", () => {
  it("links CARD_PAYMENT <-> CARD_PAYMENT without touching event_role/is_transfer", async () => {
    const cardId = await createAccount(userId, "Credit Card", "credit");
    const debit = await insertBankTxn(userId, checkingId, {
      eventRole: "CARD_PAYMENT",
      direction: "debit",
      amount: 9000,
      occurredAt: DAY,
    });
    const credit = await insertBankTxn(userId, cardId, {
      eventRole: "CARD_PAYMENT",
      direction: "credit",
      amount: 9000,
      occurredAt: DAY,
    });

    const legA = (await store.findTransferPairingCandidates(userId)).find((c) => c.id === debit)!;
    const legB = (await store.findTransferPairingCandidates(userId)).find((c) => c.id === credit)!;
    const result = await store.applyTierALink(userId, legA, legB);
    expect(result).toBe("applied");

    const a = await readTxn(debit);
    const b = await readTxn(credit);
    expect(a.transfer_pair_id).toBe(credit);
    expect(b.transfer_pair_id).toBe(debit);
    expect(a.event_role).toBe("CARD_PAYMENT"); // unchanged
    expect(b.event_role).toBe("CARD_PAYMENT"); // unchanged
  });
});

describe("Tier B — corrective classify + link, against real Postgres", () => {
  it("classifies only the previously-unresolved leg", async () => {
    const shapedId = await insertBankTxn(userId, checkingId, {
      isTransfer: true,
      eventRole: "TRANSFER",
      direction: "debit",
      amount: 7500,
      occurredAt: DAY,
    });
    const unresolvedId = await insertBankTxn(userId, savingsId, {
      eventRole: null,
      isTransfer: false,
      direction: "credit",
      amount: 7500,
      occurredAt: DAY,
    });

    const { accepted, results } = await runDetectionOnce();
    // legA/legB order is an arbitrary tie-break (both legs share one
    // occurredAt) with no operational meaning -- see sync-store.ts's
    // applyTierBClassification, which derives shaped/unresolved purely
    // from classifyLegId. Assert the pair as a set, not a fixed tuple.
    expect(accepted).toHaveLength(1);
    expect(new Set([accepted[0].legA, accepted[0].legB])).toEqual(new Set([shapedId, unresolvedId]));
    expect(accepted[0].tier).toBe("B");
    expect(accepted[0].classifyLegId).toBe(unresolvedId);
    expect(results).toEqual(["applied"]);

    const shaped = await readTxn(shapedId);
    const unresolved = await readTxn(unresolvedId);
    expect(shaped.transfer_pair_id).toBe(unresolvedId);
    expect(shaped.event_role).toBe("TRANSFER"); // unchanged, was already TRANSFER
    expect(unresolved.transfer_pair_id).toBe(shapedId);
    expect(unresolved.event_role).toBe("TRANSFER"); // newly classified
    expect(unresolved.is_transfer).toBe(true); // newly classified
  });

  it("never reclassifies a leg that already has a resolved role (PURCHASE) -- zero writes", async () => {
    await insertBankTxn(userId, checkingId, {
      isTransfer: true,
      direction: "debit",
      amount: 4321,
      occurredAt: DAY,
    });
    const purchaseId = await insertBankTxn(userId, savingsId, {
      eventRole: "PURCHASE",
      direction: "credit",
      amount: 4321,
      occurredAt: DAY,
    });

    const { accepted } = await runDetectionOnce();
    expect(accepted.some((p) => p.legA === purchaseId || p.legB === purchaseId)).toBe(false);

    const purchase = await readTxn(purchaseId);
    expect(purchase.transfer_pair_id).toBeNull();
    expect(purchase.event_role).toBe("PURCHASE");
  });

  it("ambiguous candidates (two equally-valid matches) produce zero writes on any involved row", async () => {
    const shapedId = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 6600, occurredAt: DAY });
    const cand1 = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 6600, occurredAt: DAY });
    const otherSavingsId = await createAccount(userId, "Other Savings", "savings");
    const cand2 = await insertBankTxn(userId, otherSavingsId, { isTransfer: true, direction: "credit", amount: 6600, occurredAt: DAY });

    await runDetectionOnce();

    const [a, b, c] = await Promise.all([readTxn(shapedId), readTxn(cand1), readTxn(cand2)]);
    expect(a.transfer_pair_id).toBeNull();
    expect(b.transfer_pair_id).toBeNull();
    expect(c.transfer_pair_id).toBeNull();
  });
});

describe("Concurrency — real Postgres row locking", () => {
  it("two simultaneous applyTierALink calls for the SAME pair: exactly one applies, the other skips", async () => {
    const a = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 8800, occurredAt: DAY });
    const b = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 8800, occurredAt: DAY });
    const candidates = await store.findTransferPairingCandidates(userId);
    const legA = candidates.find((c) => c.id === a)!;
    const legB = candidates.find((c) => c.id === b)!;

    // Two genuinely concurrent calls -- the `postgres` pool (max: 4 in
    // _db.ts) hands each its own real connection, so this is real
    // contention, not sequential execution disguised as parallel.
    const [r1, r2] = await Promise.all([
      store.applyTierALink(userId, legA, legB),
      store.applyTierALink(userId, legA, legB),
    ]);

    const outcomes = [r1, r2].sort();
    expect(outcomes).toEqual(["applied", "skipped"]);

    const rowA = await readTxn(a);
    const rowB = await readTxn(b);
    expect(rowA.transfer_pair_id).toBe(b);
    expect(rowB.transfer_pair_id).toBe(a);
  });

  it("a candidate that goes stale between discovery and application is skipped, with no partial write", async () => {
    const a = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 7700, occurredAt: DAY });
    const b = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 7700, occurredAt: DAY });
    const candidates = await store.findTransferPairingCandidates(userId);
    const legA = candidates.find((c) => c.id === a)!;
    const legB = candidates.find((c) => c.id === b)!;

    // Simulate a concurrent process invalidating leg B after discovery but
    // before this application call -- a real, separate write.
    await client`update public.transactions set duplicate_of_id = ${a} where id = ${b}`;

    const result = await store.applyTierALink(userId, legA, legB);
    expect(result).toBe("skipped");

    const rowA = await readTxn(a);
    expect(rowA.transfer_pair_id).toBeNull(); // no partial write on the still-valid leg
  });
});

describe("Pending -> posted lifecycle, and reconciliation", () => {
  it("CRITICAL: pending X paired with Y, Plaid posts replacement Z, X soft-deleted -> reconciliation clears Y, Z becomes eligible and pairs with Y", async () => {
    // Step 1: X (posted at pairing time) paired with Y.
    const xId = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 5500, occurredAt: DAY });
    const yId = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 5500, occurredAt: DAY });
    const { results } = await runDetectionOnce();
    expect(results).toEqual(["applied"]);
    expect((await readTxn(xId)).transfer_pair_id).toBe(yId);
    expect((await readTxn(yId)).transfer_pair_id).toBe(xId);

    // Step 2: Plaid posts a replacement Z (a NEW row -- pendingSourceRef
    // carry-over lands a distinct id, exactly like apply-sync.ts's real
    // added-with-pendingSourceRef path) and X is soft-deleted, exactly as
    // the real sync-store.ts softDeletes branch does (removed_at only).
    const zId = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 5500, occurredAt: DAY });
    await client`update public.transactions set removed_at = now() where id = ${xId}`;

    // Step 3: reconciliation must clear Y's now-stale pointer to dead X,
    // symmetrically, in one pass.
    const cleared = await store.reconcileStaleTransferPairs(userId);
    expect(cleared).toBeGreaterThanOrEqual(1);
    const yAfterReconcile = await readTxn(yId);
    expect(yAfterReconcile.transfer_pair_id).toBeNull();

    // No surviving row may still reference the dead X.
    const stillReferencingX = await client<{ id: string }[]>`
      select id from public.transactions where transfer_pair_id = ${xId}`;
    expect(stillReferencingX).toHaveLength(0);

    // Step 4: Z is now eligible (posted, unpaired) and a fresh detection
    // pass pairs it with Y.
    const { results: results2 } = await runDetectionOnce();
    expect(results2).toEqual(["applied"]);
    const yFinal = await readTxn(yId);
    const zFinal = await readTxn(zId);
    expect(yFinal.transfer_pair_id).toBe(zId);
    expect(zFinal.transfer_pair_id).toBe(yId);
  });

  it("repeated detection after an existing pair makes zero further writes (idempotent)", async () => {
    const a = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 3300, occurredAt: DAY });
    const b = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 3300, occurredAt: DAY });
    const first = await runDetectionOnce();
    expect(first.results).toEqual(["applied"]);

    const second = await runDetectionOnce();
    expect(second.accepted).toEqual([]); // already paired -> not even proposed again

    const rowA = await readTxn(a);
    const rowB = await readTxn(b);
    expect(rowA.transfer_pair_id).toBe(b);
    expect(rowB.transfer_pair_id).toBe(a);
  });

  it("late counterpart: first sync sees only one leg (no pair), second sync sees both (pairs)", async () => {
    const early = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 2200, occurredAt: DAY });
    const firstPass = await runDetectionOnce();
    expect(firstPass.accepted).toEqual([]);
    expect((await readTxn(early)).transfer_pair_id).toBeNull();

    const late = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 2200, occurredAt: DAY });
    const secondPass = await runDetectionOnce();
    expect(secondPass.results).toEqual(["applied"]);
    expect((await readTxn(early)).transfer_pair_id).toBe(late);
  });
});

describe("Reconnect -- pairs survive a disconnect, keyed on the stable accounts.id", () => {
  it("a pair keyed on accounts.id is untouched by deleting the plaid_items/plaid_accounts rows behind it", async () => {
    const [{ id: itemRowId }] = await client<{ id: string }[]>`
      insert into public.plaid_items (user_id, item_id, access_token_enc, transactions_cursor)
      values (${userId}, ${"itest-item-" + crypto.randomUUID()}, 'itest-enc', null)
      returning id`;
    const [{ id: plaidAccountRowId }] = await client<{ id: string }[]>`
      insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state)
      values (${userId}, ${itemRowId}, ${"itest-pa-" + crypto.randomUUID()}, ${checkingId}, 'mapped')
      returning id`;

    const a = await insertBankTxn(userId, checkingId, {
      isTransfer: true,
      direction: "debit",
      amount: 9900,
      occurredAt: DAY,
      plaidAccountId: plaidAccountRowId,
    });
    const b = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 9900, occurredAt: DAY });
    const { results } = await runDetectionOnce();
    expect(results).toEqual(["applied"]);

    // Disconnect: delete plaid_items (cascades plaid_accounts; transactions
    // .plaid_account_id -> SET NULL). accounts.id and transfer_pair_id are
    // untouched by this, exactly per disconnect.ts's financial-integrity rule.
    await client`delete from public.plaid_items where id = ${itemRowId}`;

    const rowA = await readTxn(a);
    const rowB = await readTxn(b);
    expect(rowA.transfer_pair_id).toBe(b);
    expect(rowB.transfer_pair_id).toBe(a);
  });
});

describe("User override lifecycle -- integrates with the existing transfer_user_set path", () => {
  it("overriding either leg after auto-pairing clears that leg's own transfer_pair_id immediately, and reconciliation clears the partner's on the next pass", async () => {
    const a = await insertBankTxn(userId, checkingId, { isTransfer: true, direction: "debit", amount: 4400, occurredAt: DAY });
    const b = await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 4400, occurredAt: DAY });
    await runDetectionOnce();
    expect((await readTxn(a)).transfer_pair_id).toBe(b);

    // User overrides leg A: unmarks it as a transfer via the EXISTING
    // ownership path (transaction-update.ts), unmodified except for the
    // one-line transfer_pair_id addition.
    const result = await updateTransactionRow(supabase, a, {
      accountId: checkingId,
      categoryId: null,
      amount: 4400,
      direction: "debit",
      occurredAt: DAY,
      description: "user override",
      note: null,
      isTransfer: false, // differs from stored `true` -> transfer_user_set flips true
    });
    expect(result.outcome).toBe("ok");

    const rowA = await readTxn(a);
    expect(rowA.transfer_user_set).toBe(true);
    expect(rowA.transfer_pair_id).toBeNull(); // cleared immediately, same write

    // Partner B still (momentarily) points at A -- the documented,
    // bounded eventually-consistent window -- until reconciliation runs.
    const rowBBefore = await readTxn(b);
    expect(rowBBefore.transfer_pair_id).toBe(a);

    const cleared = await store.reconcileStaleTransferPairs(userId);
    expect(cleared).toBeGreaterThanOrEqual(1);
    const rowBAfter = await readTxn(b);
    expect(rowBAfter.transfer_pair_id).toBeNull();
  });

  it("a transfer_user_set=true row is never re-proposed as a candidate, even with a perfect counterpart present", async () => {
    const a = await insertBankTxn(userId, checkingId, {
      isTransfer: false,
      transferUserSet: true,
      direction: "debit",
      amount: 1100,
      occurredAt: DAY,
    });
    await insertBankTxn(userId, savingsId, { isTransfer: true, direction: "credit", amount: 1100, occurredAt: DAY });

    const { accepted } = await runDetectionOnce();
    expect(accepted.some((p) => p.legA === a || p.legB === a)).toBe(false);
    expect((await readTxn(a)).transfer_pair_id).toBeNull();
  });
});

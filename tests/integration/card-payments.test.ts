/**
 * DB-integration (budgts-staging only, synthetic users): card payments (design: docs/specs/2026-10-01-card-payments-design.md).
 *
 * Proves against real Postgres what the unit tests can't:
 *  - a held card-side payment resolves to CARD_PAYMENT when its card's convention is finalized (inverted card);
 *  - a resolved convention is never overwritten by a second finalize (sync verdict vs the user's answer race);
 *  - the user's answer resolves the account, releases held rows, clears only the sign review flag, and is refused
 *    for another user's account or a transaction that isn't held;
 *  - a checking-side payment pairs with its card leg three days later, and neither leg counts as spending.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { countsForMonth } from "@/lib/budget/qualify";
import type { BudgetTxn } from "@/lib/budget/types";
import { isEventRole } from "@/lib/plaid/event-role";
import { autoResolveBlock } from "@/lib/plaid/sync-engine";
import { createPlaidSyncStore, readAutoResolveFacts } from "@/lib/plaid/sync-store";
import { findTransferPairs } from "@/lib/plaid/transfer-pairing";
import { rollup } from "@/lib/budget/rollup";
import { claimItemForSync, releaseSyncClaim } from "@/lib/plaid/item-store";
import { changeSignConventionAnswer, resolveSignConventionFromAnswer } from "@/server/plaid/sign-answer";
import { cleanupUser, client, createAccount, db, insertBankTxn, mainAccountId, seedUser, unlocked } from "./_db";

const store = createPlaidSyncStore(db);

let userId: string;
let otherUserId: string;
let checkingId: string;
let cardId: string;
let checkingFeed: string;
let cardFeed: string;

beforeAll(async () => {
  userId = await seedUser();
  otherUserId = await seedUser();
  checkingId = await mainAccountId(userId);
  cardId = await createAccount(userId, "Card", "credit");
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
    values (${userId}, ${`itest-card-item-${Date.now()}`}, 'Synthetic Bank', 'enc-blob', 'active', true) returning id`;
  const [c] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type, subtype, sign_convention)
    values (${userId}, ${item.id}, ${`itest-chk-${Date.now()}`}, ${checkingId}, 'mapped', 'Checking', 'depository', 'checking', 'standard') returning id`;
  checkingFeed = c.id;
  const [k] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type, subtype)
    values (${userId}, ${item.id}, ${`itest-card-${Date.now()}`}, ${cardId}, 'mapped', 'Card', 'credit', 'credit card') returning id`;
  cardFeed = k.id;
});

afterAll(async () => {
  await cleanupUser(userId);
  await cleanupUser(otherUserId);
});

beforeEach(async () => {
  await client`update public.plaid_accounts set sign_convention = 'unknown', needs_review = false, review_reason = null where id = ${cardFeed}`;
  await client`delete from public.plaid_sign_answers where user_id = ${userId}`;
  await client`delete from public.transactions where user_id = ${userId}`;
  await client`update public.plaid_items set sync_claim_token = null, sync_claimed_at = null where user_id = ${userId}`;
  await client`update public.plaid_accounts set sign_convention = 'standard' where id = ${checkingFeed}`;
  await client`delete from public.plaid_accounts where user_id = ${userId} and link_state = 'unmapped'`;
});

async function row(id: string) {
  const [r] = await client<
    { status: string; direction: string; event_role: string | null; is_transfer: boolean; transfer_pair_id: string | null }[]
  >`select status, direction, event_role, is_transfer, transfer_pair_id from public.transactions where id = ${id}`;
  return r;
}

const heldPayment = (raw: number) =>
  insertBankTxn(userId, cardId, {
    plaidAccountId: cardFeed,
    status: "pending_review",
    pendingReason: "sign_convention_unknown",
    // landed while unknown: direction read from the raw sign as if standard
    direction: raw > 0 ? "debit" : "credit",
    primary: "LOAN_PAYMENTS",
    detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
    description: "AUTOMATIC PAYMENT - THANK",
    eventRole: null,
    raw: { amount: raw },
  });

describe("finalizeSignConvention on a card", () => {
  it("an inverted card's held payment becomes a credit CARD_PAYMENT", async () => {
    const id = await heldPayment(250);
    expect(await store.finalizeSignConvention(cardFeed, "inverted")).toBe(true);
    expect(await row(id)).toMatchObject({ status: "confirmed", direction: "credit", event_role: "CARD_PAYMENT" });
  });

  it("never overwrites a convention that is already resolved", async () => {
    await store.finalizeSignConvention(cardFeed, "standard");
    const id = await heldPayment(250); // a straggler still held
    expect(await store.finalizeSignConvention(cardFeed, "inverted")).toBe(false);
    const [pa] = await client<{ sign_convention: string }[]>`select sign_convention from public.plaid_accounts where id = ${cardFeed}`;
    expect(pa.sign_convention).toBe("standard");
    expect(await row(id)).toMatchObject({ status: "pending_review", direction: "debit" });
  });
});

describe("resolveSignConventionFromAnswer", () => {
  it("refuses another user's account and a transaction that isn't held", async () => {
    const id = await heldPayment(-250);
    expect(await resolveSignConventionFromAnswer(db, unlocked, otherUserId, cardFeed, id, "in")).toEqual({ outcome: "not_found" });
    const confirmed = await insertBankTxn(userId, cardId, { plaidAccountId: cardFeed, raw: { amount: 5 } });
    expect(await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, confirmed, "out")).toEqual({ outcome: "not_found" });
    expect(await row(id)).toMatchObject({ status: "pending_review" });
  });

  it("an answer resolves the account, releases every held row, and clears only the sign review flag", async () => {
    await client`update public.plaid_accounts set needs_review = true,
      review_reason = 'Budgts can''t confidently determine this account''s transaction sign convention after 30 transactions'
      where id = ${cardFeed}`;
    const payment = await heldPayment(-250); // money came in to the card
    const purchase = await insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
      raw: { amount: 12 },
    });

    // The user says the purchase was money going out: raw > 0 agrees, so the card is standard.
    expect(await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "out")).toEqual({
      outcome: "resolved",
      convention: "standard",
    });
    expect(await row(payment)).toMatchObject({ status: "confirmed", direction: "credit", event_role: "CARD_PAYMENT" });
    expect(await row(purchase)).toMatchObject({ status: "confirmed", direction: "debit", event_role: "PURCHASE" });
    const [pa] = await client<{ needs_review: boolean }[]>`select needs_review from public.plaid_accounts where id = ${cardFeed}`;
    expect(pa.needs_review).toBe(false);

    expect(await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "in")).toEqual({ outcome: "already_resolved" });
  });

  it("leaves an unrelated review flag alone", async () => {
    await client`update public.plaid_accounts set needs_review = true, review_reason = 'Suspicious repetition detected.' where id = ${cardFeed}`;
    const id = await heldPayment(-40);
    await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, id, "in");
    const [pa] = await client<{ needs_review: boolean }[]>`select needs_review from public.plaid_accounts where id = ${cardFeed}`;
    expect(pa.needs_review).toBe(true);
  });
});

describe("pairing a checking-side payment with its card leg (case a)", () => {
  it("pairs legs three days apart, and neither counts as spending", async () => {
    await client`update public.plaid_accounts set sign_convention = 'standard' where id = ${cardFeed}`;
    const checkingLeg = await insertBankTxn(userId, checkingId, {
      plaidAccountId: checkingFeed,
      amount: 207850,
      direction: "debit",
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
      eventRole: null,
      occurredAt: "2026-09-10T00:00:00.000Z",
    });
    const cardLeg = await insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed,
      amount: 207850,
      direction: "credit",
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
      eventRole: "CARD_PAYMENT",
      occurredAt: "2026-09-13T00:00:00.000Z",
    });

    const candidates = await store.findTransferPairingCandidates(userId);
    const { accepted } = findTransferPairs(
      candidates.map((c) => ({ ...c, eventRole: c.eventRole != null && isEventRole(c.eventRole) ? c.eventRole : null })),
    );
    expect(accepted).toHaveLength(1);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const pair = accepted[0];
    expect(pair.classifyLegId).toBe(checkingLeg);
    expect(await store.applyTierBClassification(userId, byId.get(pair.legA)!, byId.get(pair.legB)!, pair.classifyLegId!)).toBe(
      "applied",
    );

    const c = await row(checkingLeg);
    const k = await row(cardLeg);
    expect(c).toMatchObject({ is_transfer: true, event_role: "TRANSFER", transfer_pair_id: cardLeg });
    expect(k).toMatchObject({ event_role: "CARD_PAYMENT", transfer_pair_id: checkingLeg });
    for (const [r, amount] of [[c, 207850], [k, 207850]] as const) {
      const txn: BudgetTxn = {
        amount,
        direction: r.direction as "debit" | "credit",
        occurredAt: new Date("2026-09-12T00:00:00.000Z"),
        categoryId: null,
        isTransfer: r.is_transfer,
        eventRole: r.event_role != null && isEventRole(r.event_role) ? r.event_role : null,
        status: "confirmed",
        duplicateOfId: null,
        transferUserSet: false,
        accountExcluded: false,
      };
      expect(countsForMonth(txn, "2026-09")).toBe(false);
    }
  });
});

describe("tools/card-payment-remediation.ts (dry run, apply, revert) on a synthetic user", () => {
  const runTool = (...extra: string[]) =>
    execFileSync(
      process.execPath,
      [path.join("node_modules", "tsx", "dist", "cli.mjs"), "tools/card-payment-remediation.ts", "--env", "staging", "--user", userId, ...extra],
      { encoding: "utf8", timeout: 120_000 },
    );

  it("backfills a role-less card payment, releases a straggler held row, leaves a user-categorized one alone, and reverts", async () => {
    await client`update public.plaid_accounts set sign_convention = 'standard' where id = ${cardFeed}`;
    const legacy = await insertBankTxn(userId, checkingId, {
      plaidAccountId: checkingFeed,
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      direction: "debit",
      eventRole: null,
      occurredAt: "2026-09-05T00:00:00.000Z",
    });
    const cardSide = await insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed,
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
      direction: "credit",
      eventRole: null,
      occurredAt: "2026-09-06T00:00:00.000Z",
    });
    const mine = await insertBankTxn(userId, checkingId, {
      plaidAccountId: checkingFeed,
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      direction: "debit",
      eventRole: null,
      userCategorized: true,
    });
    const straggler = await heldPayment(-75); // the card is already standard; this row was never released

    const dry = runTool();
    expect(dry).toContain("--apply would write: 2 role backfills, 1 held-row releases; 1 user-categorized");
    expect(dry).toContain("automatic at deploy:");
    expect(dry).toContain("Dry run: nothing was written");
    expect((await row(legacy)).event_role).toBeNull();

    const applied = runTool("--apply", "--confirm-ref", "uvowywszaiojboaxdmoz");
    expect(applied).toContain("applied: 3 of 3 rows");
    expect((await row(legacy)).event_role).toBe("CARD_PAYMENT");
    expect((await row(cardSide)).event_role).toBe("CARD_PAYMENT");
    expect((await row(mine)).event_role).toBeNull();
    expect(await row(straggler)).toMatchObject({ status: "confirmed", event_role: "CARD_PAYMENT" });

    const auditFile = /audit file \(old and new values\): (.+)/.exec(applied)![1].trim();
    expect(fs.existsSync(auditFile)).toBe(true);
    const reverted = runTool("--revert", auditFile, "--confirm-ref", "uvowywszaiojboaxdmoz");
    expect(reverted).toContain("reverted 3 of 3 rows");
    expect((await row(legacy)).event_role).toBeNull();
    expect(await row(straggler)).toMatchObject({ status: "pending_review", event_role: null });
    fs.rmSync(auditFile);
  }, 300_000);

  it("previews what the deployed sync does by itself: B auto-resolution (and its gate) and C's new 3-day pairs", async () => {
    // B: the card is unknown with 8 held purchases (raw > 0): the deployed sync would resolve it standard.
    for (let i = 0; i < 8; i++) {
      await insertBankTxn(userId, cardId, {
        plaidAccountId: cardFeed, status: "pending_review", pendingReason: "sign_convention_unknown", direction: "debit",
        primary: "GENERAL_MERCHANDISE", raw: { amount: 10 + i }, amount: 1000 + i * 100, occurredAt: "2026-09-02T00:00:00.000Z",
      });
    }
    // C: a checking-side payment with no role, and its card leg three days later.
    await insertBankTxn(userId, checkingId, {
      plaidAccountId: checkingFeed, primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_OTHER_PAYMENT", direction: "debit",
      eventRole: null, amount: 31337, raw: { amount: 313.37 }, occurredAt: "2026-09-10T00:00:00.000Z",
    });
    await insertBankTxn(userId, cardId, {
      plaidAccountId: checkingFeed, primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_OTHER_PAYMENT", direction: "credit",
      eventRole: "CARD_PAYMENT", amount: 31337, raw: { amount: -313.37 }, occurredAt: "2026-09-13T00:00:00.000Z",
    });

    const dry = runTool();
    expect(dry).toContain(`${cardFeed.slice(0, 8)} user ${userId.slice(0, 8)}`);
    expect(dry).toContain("AUTO-RESOLVES standard, releases 8 rows");
    expect(dry).toContain("automatic at deploy: 8 held rows released on 1 accounts (B), 1 new pairs, 1 rows classified as transfers (C)");
    expect(dry).toMatch(/NEW user \w{8} tier B: .*\$313\.37 2026-09-1\d.*becomes a transfer/);
    expect(dry).toContain("Dry run: nothing was written");

    // The gate: the same account flagged for review is held back for the user's answer.
    await client`update public.plaid_accounts set needs_review = true, review_reason = 'Suspicious repetition detected.' where id = ${cardFeed}`;
    expect(runTool()).toContain("held back (flagged_for_review): the user's answer");
  }, 300_000);

  it("refuses --apply without the matching --confirm-ref", () => {
    expect(() => runTool("--apply")).toThrow();
  });
});

describe("changeSignConventionAnswer (design: 2026-10-01 card payments §5a)", () => {
  /** The user's September spend on the card, computed with the app's own rollup. */
  async function cardSpend(): Promise<number> {
    const rows = await client<
      { amount: string; direction: "debit" | "credit"; occurred_at: Date; category_id: string | null; is_transfer: boolean;
        event_role: string | null; status: "confirmed" | "pending_review"; duplicate_of_id: string | null; transfer_user_set: boolean }[]
    >`select amount, direction, occurred_at, category_id, is_transfer, event_role, status, duplicate_of_id, transfer_user_set
      from public.transactions where user_id = ${userId} and account_id = ${cardId} and removed_at is null`;
    const cats = await client<{ id: string; kind: "expense" | "income" }[]>`select id, kind from public.categories where user_id = ${userId}`;
    const txns: BudgetTxn[] = rows.map((r) => ({
      amount: Number(r.amount),
      direction: r.direction,
      occurredAt: new Date(r.occurred_at),
      categoryId: r.category_id,
      isTransfer: r.is_transfer,
      eventRole: r.event_role != null && isEventRole(r.event_role) ? r.event_role : null,
      status: r.status,
      duplicateOfId: r.duplicate_of_id,
      transferUserSet: r.transfer_user_set,
      accountExcluded: false,
    }));
    return rollup(txns, cats, "2026-09").spend;
  }

  const heldPurchase = () =>
    insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_GROCERIES",
      description: "Trader Joe's",
      amount: 4000,
      raw: { amount: 40 },
      occurredAt: "2026-09-12T00:00:00.000Z",
    });
  const heldCardPayment = () =>
    insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "credit",
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
      amount: 10000,
      raw: { amount: -100 },
      occurredAt: "2026-09-14T00:00:00.000Z",
    });

  it("a wrong answer, then the right one: rows and totals are corrected, an own edit is kept, both writes audited", async () => {
    const purchase = await heldPurchase();
    const payment = await heldCardPayment();
    // Wrong: the user says the grocery run was money coming in, so the card resolves inverted.
    expect(await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "in")).toEqual({ outcome: "resolved", convention: "inverted" });
    expect(await row(purchase)).toMatchObject({ direction: "credit", event_role: "REFUND" });
    expect(await row(payment)).toMatchObject({ direction: "debit", event_role: null });
    expect(await cardSpend()).toBe(-4000 + 10000); // the purchase reads as a refund and the payment as new spend

    // A row synced later under the wrong convention, and one edited by hand (its direction disagrees with it).
    const later = await insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed, direction: "credit", primary: "FOOD_AND_DRINK", eventRole: "REFUND", amount: 1000,
      raw: { amount: 10 }, occurredAt: "2026-09-20T00:00:00.000Z",
    });
    const edited = await insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed, direction: "debit", primary: "FOOD_AND_DRINK", eventRole: "PURCHASE", amount: 500,
      raw: { amount: 5 }, occurredAt: "2026-09-21T00:00:00.000Z",
    });

    expect(await changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out")).toEqual({
      outcome: "changed",
      convention: "standard",
      changedRows: 3,
    });
    expect(await row(purchase)).toMatchObject({ direction: "debit", event_role: "PURCHASE", status: "confirmed" });
    expect(await row(payment)).toMatchObject({ direction: "credit", event_role: "CARD_PAYMENT" });
    expect(await row(later)).toMatchObject({ direction: "debit", event_role: "PURCHASE" });
    expect(await row(edited)).toMatchObject({ direction: "debit", event_role: "PURCHASE" }); // untouched
    expect(await cardSpend()).toBe(4000 + 1000 + 500); // purchases only; the card payment is not spending

    const audit = await client<{ kind: string; from_convention: string; to_convention: string; changed_rows: { id: string; direction: string }[] }[]>`
      select kind, from_convention, to_convention, changed_rows from public.plaid_sign_answers
      where plaid_account_id = ${cardFeed} order by created_at`;
    expect(audit.map((a) => [a.kind, a.from_convention, a.to_convention])).toEqual([
      ["answer", "unknown", "inverted"],
      ["change", "inverted", "standard"],
    ]);
    const old = new Map(audit[1].changed_rows.map((r) => [r.id, r.direction]));
    expect(old.get(purchase)).toBe("credit");
    expect(old.get(later)).toBe("credit");
    expect(old.has(edited)).toBe(false);

    // Idempotent: the same answer again changes nothing and records nothing.
    expect(await changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out")).toEqual({ outcome: "unchanged" });
    const [{ n }] = await client<{ n: number }[]>`select count(*)::int n from public.plaid_sign_answers where plaid_account_id = ${cardFeed}`;
    expect(n).toBe(2);
  });

  it("refuses another user's account, and an account still being checked", async () => {
    const purchase = await heldPurchase();
    expect(await changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "in")).toEqual({ outcome: "not_answered" });
    await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "out");
    expect(await changeSignConventionAnswer(db, unlocked, otherUserId, cardFeed, purchase, "in")).toEqual({ outcome: "not_found" });
    expect((await row(purchase)).direction).toBe("debit");
  });

  it("an account resolved from evidence can be flipped (amounts look reversed) and flipped back, both audited (§5b)", async () => {
    const coffee = await insertBankTxn(userId, checkingId, {
      plaidAccountId: checkingFeed, direction: "debit", primary: "FOOD_AND_DRINK", eventRole: "PURCHASE", raw: { amount: 5 }, amount: 500,
    });
    expect(await changeSignConventionAnswer(db, unlocked, userId, checkingFeed, coffee, "in")).toEqual({
      outcome: "changed",
      convention: "inverted",
      changedRows: 1,
    });
    expect(await row(coffee)).toMatchObject({ direction: "credit", event_role: "REFUND" });
    expect(await changeSignConventionAnswer(db, unlocked, userId, checkingFeed, coffee, "out")).toMatchObject({ outcome: "changed", convention: "standard" });
    expect(await row(coffee)).toMatchObject({ direction: "debit", event_role: "PURCHASE" });
    const audit = await client<{ kind: string; from_convention: string; to_convention: string }[]>`
      select kind, from_convention, to_convention from public.plaid_sign_answers where plaid_account_id = ${checkingFeed} order by created_at`;
    expect(audit.map((a) => [a.kind, a.from_convention, a.to_convention])).toEqual([
      ["change", "standard", "inverted"],
      ["change", "inverted", "standard"],
    ]);
  });

  it("says the bank is still being set up, not busy, while an account awaits its import choice", async () => {
    const purchase = await heldPurchase();
    const [item] = await client<{ plaid_item_id: string }[]>`select plaid_item_id from public.plaid_accounts where id = ${cardFeed}`;
    await client`insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, link_state, name)
      values (${userId}, ${item.plaid_item_id}, ${`itest-unmapped-${Date.now()}`}, 'unmapped', 'New')`;
    expect(await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "out")).toEqual({ outcome: "setting_up" });
    expect(await row(purchase)).toMatchObject({ status: "pending_review" });
  });

  it("is refused while a sync holds the bank, and of two racing changes exactly one applies", async () => {
    const purchase = await heldPurchase();
    await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "in"); // inverted

    const [item] = await client<{ item_id: string }[]>`
      select pi.item_id from public.plaid_items pi join public.plaid_accounts pa on pa.plaid_item_id = pi.id where pa.id = ${cardFeed}`;
    const claim = await claimItemForSync(db, item.item_id, { kind: "requested" });
    expect(claim).not.toBeNull();
    expect(await changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out")).toEqual({ outcome: "busy" });
    expect((await row(purchase)).direction).toBe("credit");
    await releaseSyncClaim(db, item.item_id, claim!.token, false);

    const results = await Promise.all([
      changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out"),
      changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out"),
    ]);
    expect(results.filter((r) => r.outcome === "changed")).toHaveLength(1);
    expect(results.every((r) => ["changed", "busy", "unchanged"].includes(r.outcome))).toBe(true);
    expect((await row(purchase)).direction).toBe("debit"); // flipped exactly once
    const [pa] = await client<{ sign_convention: string }[]>`select sign_convention from public.plaid_accounts where id = ${cardFeed}`;
    expect(pa.sign_convention).toBe("standard");
  });

  it("unlinks a transfer pair whose leg it re-evaluates, and undoes a pairing-only transfer on the partner", async () => {
    const purchase = await heldPurchase();
    await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "in"); // inverted
    const leg = await insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed, direction: "credit", primary: "TRANSFER_IN", isTransfer: true, eventRole: "TRANSFER",
      raw: { amount: 25 }, amount: 2500,
    });
    // The partner only became a transfer because Tier B classified it (Plaid called it a loan payment).
    const partner = await insertBankTxn(userId, checkingId, {
      plaidAccountId: checkingFeed, direction: "debit", primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
      isTransfer: true, eventRole: "TRANSFER", raw: { amount: 25 }, amount: 2500,
    });
    await client`update public.transactions set transfer_pair_id = ${partner} where id = ${leg}`;
    await client`update public.transactions set transfer_pair_id = ${leg} where id = ${partner}`;

    await changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out");
    // the Plaid-labelled transfer leg stays a transfer; only its link and direction change
    expect(await row(leg)).toMatchObject({ direction: "debit", transfer_pair_id: null, event_role: "TRANSFER", is_transfer: true });
    // the partner keeps its direction, loses the link, and returns to its own signal
    expect(await row(partner)).toMatchObject({ direction: "debit", transfer_pair_id: null, is_transfer: false, event_role: null });

    const [audit] = await client<{ changed_rows: Record<string, unknown>[] }[]>`
      select changed_rows from public.plaid_sign_answers where plaid_account_id = ${cardFeed} and kind = 'change'`;
    expect(audit.changed_rows).toEqual(
      expect.arrayContaining([
        { id: partner, transferPairId: leg, isTransfer: true, eventRole: "TRANSFER", partnerUnlinked: true },
      ]),
    );
  });
});

describe("readAutoResolveFacts (the sync's auto-resolve gate, design: 2026-10-01 card payments §4a)", () => {
  it("reports the bank status, identical copies, and confirmed rows a verdict would contradict", async () => {
    // two byte-identical rows, and one confirmed row landed as standard (raw 9 -> debit)
    await insertBankTxn(userId, cardId, { plaidAccountId: cardFeed, raw: { amount: 9 }, direction: "debit" });
    await client`update public.transactions set content_fingerprint = 'same' where user_id = ${userId}`;
    await insertBankTxn(userId, cardId, { plaidAccountId: cardFeed, raw: { amount: 9 }, direction: "debit" });
    await client`update public.transactions set content_fingerprint = 'same' where user_id = ${userId}`;

    const standard = await readAutoResolveFacts(db, cardFeed, "standard");
    expect(standard).toMatchObject({ itemStatus: "active", largestIdenticalGroup: 2, confirmedContradicting: 0 });
    const inverted = await readAutoResolveFacts(db, cardFeed, "inverted");
    expect(inverted.confirmedContradicting).toBe(2);
    expect(autoResolveBlock(inverted)).toBe("contradicts_confirmed_rows");
  });
});

// The answer and the change hold the bank's sync lease; releasing it must never drop a sync that was already
// requested (a webhook) before they took it, nor leave one behind that nobody asked for.
describe("the sync lease taken by an answer or a change keeps a pending sync pending", () => {
  const heldPurchase = () =>
    insertBankTxn(userId, cardId, {
      plaidAccountId: cardFeed,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
      amount: 4000,
      raw: { amount: 40 },
    });
  async function needsSync(): Promise<boolean> {
    const [r] = await client<{ needs_sync: boolean }[]>`
      select pi.needs_sync from public.plaid_items pi join public.plaid_accounts pa on pa.plaid_item_id = pi.id where pa.id = ${cardFeed}`;
    return r.needs_sync;
  }
  async function setNeedsSync(v: boolean) {
    await client`update public.plaid_items pi set needs_sync = ${v}, last_webhook_at = null
      from public.plaid_accounts pa where pa.plaid_item_id = pi.id and pa.id = ${cardFeed}`;
  }

  it("a webhook-requested sync before the answer is still pending after it", async () => {
    const purchase = await heldPurchase();
    await setNeedsSync(true);
    expect(await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "out")).toMatchObject({ outcome: "resolved" });
    expect(await needsSync()).toBe(true);
  });

  it("with no prior request, an answer leaves none behind", async () => {
    const purchase = await heldPurchase();
    await setNeedsSync(false);
    await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "out");
    expect(await needsSync()).toBe(false);
  });

  it("a webhook flag committed while the claim waits on its row lock is not lost (two connections)", async () => {
    const purchase = await heldPurchase();
    await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "in");
    await setNeedsSync(false);
    const [item] = await client<{ item_id: string }[]>`
      select pi.item_id from public.plaid_items pi join public.plaid_accounts pa on pa.plaid_item_id = pi.id where pa.id = ${cardFeed}`;

    // A webhook's write (markItemNeedsSync), held open on its own connection so it lands mid-claim.
    const webhook = await client.reserve();
    try {
      await webhook`begin`;
      await webhook`update public.plaid_items set needs_sync = true, last_webhook_at = now() where item_id = ${item.item_id}`;
      const change = changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out");
      await new Promise((r) => setTimeout(r, 750)); // the claim is now waiting on the webhook's row lock
      await webhook`commit`;
      expect(await change).toMatchObject({ outcome: "changed" });
    } finally {
      webhook.release();
    }
    expect(await needsSync()).toBe(true);
  });

  it("the same holds for a change", async () => {
    const purchase = await heldPurchase();
    await resolveSignConventionFromAnswer(db, unlocked, userId, cardFeed, purchase, "in");
    await setNeedsSync(true);
    expect(await changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "out")).toMatchObject({ outcome: "changed" });
    expect(await needsSync()).toBe(true);
    await setNeedsSync(false);
    expect(await changeSignConventionAnswer(db, unlocked, userId, cardFeed, purchase, "in")).toMatchObject({ outcome: "changed" });
    expect(await needsSync()).toBe(false);
  });
});


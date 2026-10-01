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
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import { findTransferPairs } from "@/lib/plaid/transfer-pairing";
import { resolveSignConventionFromAnswer } from "@/server/plaid/sign-answer";
import { cleanupUser, client, createAccount, db, insertBankTxn, mainAccountId, seedUser } from "./_db";

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
  await client`delete from public.transactions where user_id = ${userId}`;
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
    expect(await resolveSignConventionFromAnswer(db, otherUserId, cardFeed, id, "in")).toEqual({ outcome: "not_found" });
    const confirmed = await insertBankTxn(userId, cardId, { plaidAccountId: cardFeed, raw: { amount: 5 } });
    expect(await resolveSignConventionFromAnswer(db, userId, cardFeed, confirmed, "out")).toEqual({ outcome: "not_found" });
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
    expect(await resolveSignConventionFromAnswer(db, userId, cardFeed, purchase, "out")).toEqual({
      outcome: "resolved",
      convention: "standard",
    });
    expect(await row(payment)).toMatchObject({ status: "confirmed", direction: "credit", event_role: "CARD_PAYMENT" });
    expect(await row(purchase)).toMatchObject({ status: "confirmed", direction: "debit", event_role: "PURCHASE" });
    const [pa] = await client<{ needs_review: boolean }[]>`select needs_review from public.plaid_accounts where id = ${cardFeed}`;
    expect(pa.needs_review).toBe(false);

    expect(await resolveSignConventionFromAnswer(db, userId, cardFeed, purchase, "in")).toEqual({ outcome: "already_resolved" });
  });

  it("leaves an unrelated review flag alone", async () => {
    await client`update public.plaid_accounts set needs_review = true, review_reason = 'Suspicious repetition detected.' where id = ${cardFeed}`;
    const id = await heldPayment(-40);
    await resolveSignConventionFromAnswer(db, userId, cardFeed, id, "in");
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
    expect(dry).toContain("2 role backfills, 1 held-row releases, 0 account conventions resolved; 1 user-categorized");
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

  it("refuses --apply without the matching --confirm-ref", () => {
    expect(() => runTool("--apply")).toThrow();
  });
});


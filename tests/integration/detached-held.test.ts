/**
 * DB-integration (budgts-staging only, synthetic users): held rows a removed bank left behind (design:
 * docs/specs/2026-10-01-card-payments-design.md §5c).
 *
 * The disconnect step deletes the plaid_items row exactly as the shared disconnect does, so the real FK chain detaches
 * the rows (plaid_account_id SET NULL). Proves:
 *  - the answer releases exactly one group (Budgts account + original feed), never another feed's rows or the account's
 *    other history, and is refused for another user's row or a row that isn't held;
 *  - "Change answer" flips exactly the rows the answer released, is idempotent, and changing back is the undo;
 *  - every write is audited in detached_sign_answers with the old values;
 *  - prevention: a reconnect that adopts a held kept row into an already-resolved account releases it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runSync } from "@/lib/plaid/sync-engine";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import type { NormalizeCtx, PlaidTxnInput } from "@/lib/plaid/types";
import { changeDetachedHeldAnswer, resolveDetachedHeldFromAnswer } from "@/server/plaid/detached-sign-answer";
import { cleanupUser, client, createAccount, db, insertBankTxn, mainAccountId, seedUser, unlocked } from "./_db";

const stamp = Date.now();
let userId: string;
let otherUserId: string;
let checkingId: string;
const feedA = `itest-feedA-${stamp}`;
const feedB = `itest-feedB-${stamp}`;
const ids: Record<string, string> = {};

async function row(id: string) {
  const [r] = await client<{ status: string; pending_reason: string | null; direction: string; event_role: string | null; plaid_account_id: string | null }[]>`
    select status, pending_reason, direction, event_role, plaid_account_id from public.transactions where id = ${id}`;
  return r;
}

beforeAll(async () => {
  userId = await seedUser();
  otherUserId = await seedUser();
  checkingId = await mainAccountId(userId);
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
    values (${userId}, ${`itest-detached-${stamp}`}, 'Synthetic Bank', 'enc-blob', 'active') returning id`;
  const pa = async (ext: string) =>
    (await client<{ id: string }[]>`
      insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type, subtype)
      values (${userId}, ${item.id}, ${ext}, ${checkingId}, 'mapped', 'Checking', 'depository', 'checking') returning id`)[0]!.id;
  const paA = await pa(feedA);
  const paB = await pa(feedB);
  const held = (plaidAccountId: string, feed: string, raw: number, description: string, occurredAt: string) =>
    insertBankTxn(userId, checkingId, {
      plaidAccountId,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: raw > 0 ? "debit" : "credit", // landed while unknown: read as if standard
      primary: "GENERAL_SERVICES",
      detailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES",
      eventRole: null,
      description,
      occurredAt,
      raw: { amount: raw, account_id: feed },
    });
  ids.anthropic = await held(paA, feedA, 21.2, "Anthropic", "2026-09-15T00:00:00Z");
  ids.evo = await held(paA, feedA, 13.77, "Evo Fuel & Market", "2026-09-15T00:00:00Z");
  ids.openai = await held(paA, feedA, 8.48, "OpenAI", "2026-09-14T00:00:00Z");
  // A removed copy is released too (it counts nowhere either way), as finalizeSignConvention does.
  ids.removed = await insertBankTxn(userId, checkingId, {
    plaidAccountId: paA,
    status: "pending_review",
    pendingReason: "sign_convention_unknown",
    removedAt: "2026-09-15T00:00:00Z",
    raw: { amount: 21.2, account_id: feedA },
  });
  // Same feed, confirmed before conventions existed: not the answer's to touch.
  ids.legacy = await insertBankTxn(userId, checkingId, { plaidAccountId: paA, direction: "debit", raw: { amount: 5, account_id: feedA } });
  // Another feed into the same Budgts account: its own group.
  ids.otherFeed = await held(paB, feedB, 30, "Other bank", "2026-09-16T00:00:00Z");
  // Disconnect: the Item goes, plaid_accounts cascade, every row is kept, detached.
  await client`delete from public.plaid_items where id = ${item.id}`;
  expect((await row(ids.anthropic)).plaid_account_id).toBeNull();
});

afterAll(async () => {
  await cleanupUser(userId);
  await cleanupUser(otherUserId);
  await client.end();
});

describe("the answer for a removed bank's held rows", () => {
  it("is refused for another user's row, a row that isn't held, and a change before any answer", async () => {
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, otherUserId, ids.anthropic, "out")).toEqual({ outcome: "not_found" });
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, userId, ids.legacy, "out")).toEqual({ outcome: "not_found" });
    expect(await changeDetachedHeldAnswer(db, unlocked, userId, ids.anthropic, "in")).toEqual({ outcome: "not_answered" });
    expect((await row(ids.anthropic)).status).toBe("pending_review");
  });

  it("releases exactly its group, audited with the old values", async () => {
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, userId, ids.anthropic, "out")).toEqual({ outcome: "resolved", convention: "standard", released: 4 });
    for (const id of [ids.anthropic, ids.evo, ids.openai]) {
      expect(await row(id)).toMatchObject({ status: "confirmed", pending_reason: null, direction: "debit", event_role: "PURCHASE" });
    }
    expect(await row(ids.removed)).toMatchObject({ status: "confirmed", pending_reason: null, direction: "debit" });
    expect(await row(ids.otherFeed)).toMatchObject({ status: "pending_review" });
    expect(await row(ids.legacy)).toMatchObject({ status: "confirmed", direction: "debit" });
    const audit = await client<{ kind: string; from_convention: string; to_convention: string; changed_rows: { id: string; status: string }[] }[]>`
      select kind, from_convention, to_convention, changed_rows from public.detached_sign_answers where user_id = ${userId}`;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ kind: "answer", from_convention: "unknown", to_convention: "standard" });
    expect(audit[0]!.changed_rows.map((r) => r.id).sort()).toEqual([ids.anthropic, ids.evo, ids.openai, ids.removed].sort());
    expect(audit[0]!.changed_rows.every((r) => r.status === "pending_review")).toBe(true);
    // Nothing left held in the group: a repeat answer finds nothing to answer about.
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, userId, ids.evo, "out")).toEqual({ outcome: "not_found" });
  });

  it("Change answer flips exactly the released rows, is idempotent, and changing back undoes it", async () => {
    expect(await changeDetachedHeldAnswer(db, unlocked, userId, ids.anthropic, "out")).toEqual({ outcome: "unchanged" });
    expect(await changeDetachedHeldAnswer(db, unlocked, userId, ids.anthropic, "in")).toEqual({ outcome: "changed", convention: "inverted", changedRows: 3 });
    for (const id of [ids.anthropic, ids.evo, ids.openai]) expect(await row(id)).toMatchObject({ direction: "credit", event_role: "REFUND" });
    expect(await row(ids.legacy)).toMatchObject({ direction: "debit" }); // its direction matches "standard" too, but the answer never set it
    expect(await changeDetachedHeldAnswer(db, unlocked, userId, ids.openai, "out")).toEqual({ outcome: "changed", convention: "standard", changedRows: 3 });
    for (const id of [ids.anthropic, ids.evo, ids.openai]) expect(await row(id)).toMatchObject({ direction: "debit", event_role: "PURCHASE" });
    const kinds = await client<{ kind: string }[]>`select kind from public.detached_sign_answers where user_id = ${userId} order by created_at`;
    expect(kinds.map((k) => k.kind)).toEqual(["answer", "change", "change"]);
  });

  it("an inverted feed's answer flips its rows", async () => {
    // raw +30 on an inverted feed is money coming in.
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, userId, ids.otherFeed, "in")).toEqual({ outcome: "resolved", convention: "inverted", released: 1 });
    expect(await row(ids.otherFeed)).toMatchObject({ status: "confirmed", direction: "credit" });
  });
});

/** Links a new Plaid account (convention given) to `accountId` and syncs one transaction into it. */
async function adoptInto(accountId: string, tag: string, convention: "standard" | "inverted" | "unknown", txn: Partial<PlaidTxnInput>) {
  await new Promise((r) => setTimeout(r, 20)); // the new Plaid account is connected after the kept row was imported
  const itemId = `itest-adopt-${tag}-${stamp}`;
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
    values (${userId}, ${itemId}, 'Synthetic Bank', 'enc-blob', 'active') returning id`;
  const newExt = `itest-new-${tag}-${stamp}`;
  const [pa] = await client<{ id: string }[]>`
    insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type, sign_convention)
    values (${userId}, ${item.id}, ${newExt}, ${accountId}, 'mapped', 'Checking', 'depository', ${convention}) returning id`;
  const ctx: NormalizeCtx = {
    accountMap: new Map([[newExt, { plaidAccountRowId: pa.id, budgtsAccountId: accountId, ignored: false, signConvention: convention, accountType: "depository" }]]),
    currency: "USD",
    resolveCategory: () => null,
  };
  const t: PlaidTxnInput = {
    transaction_id: `new-${tag}-${stamp}`,
    account_id: newExt,
    amount: 7.5,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-09-20",
    name: "Coffee",
    merchant_name: "Coffee",
    merchant_entity_id: null,
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE", confidence_level: "HIGH" },
    ...txn,
  };
  await runSync({
    userId,
    itemId,
    institutionId: null,
    initialCursor: null,
    transactionsSync: async () => ({ added: [t], modified: [], removed: [], next_cursor: "c1", has_more: false }),
    store: createPlaidSyncStore(db),
    normalizeCtx: ctx,
  });
  const [{ n }] = await client<{ n: number }[]>`select count(*)::int n from public.transactions where user_id = ${userId} and source_ref = ${t.transaction_id}`;
  expect(n).toBe(1); // adopted onto the kept row, never landed twice
  return pa.id;
}

/** A kept, detached row held for the sign check, as an earlier connection left it. */
const keptHeld = (accountId: string, over: Parameters<typeof insertBankTxn>[2] = {}) =>
  insertBankTxn(userId, accountId, {
    plaidAccountId: null,
    status: "pending_review",
    pendingReason: "sign_convention_unknown",
    direction: "debit",
    primary: "FOOD_AND_DRINK",
    detailed: "FOOD_AND_DRINK_COFFEE",
    occurredAt: "2026-09-20T00:00:00Z",
    raw: { amount: 7.5, account_id: "itest-old", date: "2026-09-20", name: "Coffee" },
    ...over,
  });

describe("prevention: reconnect adoption into an already-resolved account", () => {
  it("releases a held kept row with the new account's reading", async () => {
    const acct = await createAccount(userId, "Adopt A", "checking");
    const heldId = await keptHeld(acct);
    const pa = await adoptInto(acct, "a", "inverted", {});
    expect(await row(heldId)).toMatchObject({ status: "confirmed", pending_reason: null, direction: "credit", event_role: "REFUND", plaid_account_id: pa });
  });

  it("keeps the user's own direction edit on the kept row (only the role is recomputed)", async () => {
    const acct = await createAccount(userId, "Adopt B", "checking");
    // raw 7.5 landed as debit; the user changed it to credit.
    const heldId = await keptHeld(acct, { direction: "credit" });
    await adoptInto(acct, "b", "standard", {}); // the new transaction lands debit; the edit must survive
    expect(await row(heldId)).toMatchObject({ status: "confirmed", direction: "credit", event_role: "REFUND" });
  });

  it("takes the role from the kept row's own transfer flag, never the new transaction's", async () => {
    const acct = await createAccount(userId, "Adopt C", "checking");
    // The user marked this TRANSFER_OUT "not a transfer".
    const heldId = await keptHeld(acct, { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER", isTransfer: false, transferUserSet: true });
    await adoptInto(acct, "c", "standard", {
      personal_finance_category: { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER", confidence_level: "HIGH" },
    });
    const r = await row(heldId);
    expect(r).toMatchObject({ status: "confirmed", direction: "debit" });
    expect(r.event_role).not.toBe("TRANSFER");
    const [{ is_transfer }] = await client<{ is_transfer: boolean }[]>`select is_transfer from public.transactions where id = ${heldId}`;
    expect(is_transfer).toBe(false);
  });

  it("a new transaction held for a currency mismatch moves the kept row to that hold, never leaves it sign-held", async () => {
    const acct = await createAccount(userId, "Adopt D", "checking");
    const heldId = await keptHeld(acct);
    await adoptInto(acct, "d", "standard", { iso_currency_code: "CAD" });
    expect(await row(heldId)).toMatchObject({ status: "pending_review", pending_reason: "currency_mismatch", direction: "debit" });
  });

  it("leaves a kept row held when the adopting account is still unknown (its own question asks)", async () => {
    const acct = await createAccount(userId, "Adopt E", "checking");
    const heldId = await keptHeld(acct);
    await adoptInto(acct, "e", "unknown", {});
    expect(await row(heldId)).toMatchObject({ status: "pending_review", pending_reason: "sign_convention_unknown" });
  });
});

describe("removed-bank answers: edge cases", () => {
  /** A Budgts account fed by Plaid accounts of the given types (identities recorded by the 0027 trigger), then disconnected. */
  async function fedThenRemoved(name: string, types: string[], heldRows: Parameters<typeof insertBankTxn>[2][]) {
    const acct = await createAccount(userId, name, "checking");
    const [item] = await client<{ id: string }[]>`
      insert into public.plaid_items (user_id, item_id, institution_name, institution_id, access_token_enc, status)
      values (${userId}, ${`itest-edge-${name}-${stamp}`}, 'Synthetic Bank', 'ins_itest', 'enc-blob', 'active') returning id`;
    const paIds: string[] = [];
    for (const [i, type] of types.entries()) {
      const [pa] = await client<{ id: string }[]>`
        insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type, mask)
        values (${userId}, ${item.id}, ${`itest-edge-${name}-${i}-${stamp}`}, ${acct}, 'mapped', 'Feed', ${type}, ${`${1000 + i}`}) returning id`;
      paIds.push(pa.id);
    }
    const ids: string[] = [];
    for (const r of heldRows) {
      ids.push(await insertBankTxn(userId, acct, { plaidAccountId: paIds[0]!, status: "pending_review", pendingReason: "sign_convention_unknown", ...r }));
    }
    await client`delete from public.plaid_items where id = ${item.id}`;
    return ids;
  }
  const cardPayment = {
    primary: "LOAN_PAYMENTS",
    detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
    direction: "credit" as const,
    eventRole: null,
    raw: { amount: -50, account_id: "itest-card-feed" },
  };

  it("uses the Plaid type the account's bank identities agree on: a card's incoming payment is a CARD_PAYMENT", async () => {
    const [id] = await fedThenRemoved("Card fed", ["credit"], [cardPayment]);
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, userId, id!, "in")).toMatchObject({ outcome: "resolved", convention: "standard" });
    expect(await row(id!)).toMatchObject({ status: "confirmed", direction: "credit", event_role: "CARD_PAYMENT" });
  });

  it("never guesses a card when the identities disagree on the type", async () => {
    const [id] = await fedThenRemoved("Mixed fed", ["credit", "depository"], [{ ...cardPayment, raw: { amount: -50, account_id: "itest-mixed-feed" } }]);
    await resolveDetachedHeldFromAnswer(db, unlocked, userId, id!, "in");
    const r = await row(id!);
    expect(r).toMatchObject({ status: "confirmed", direction: "credit" });
    expect(r.event_role).not.toBe("CARD_PAYMENT");
  });

  it("keeps a user's direction edit on a held row when the answer releases it", async () => {
    const [sample, edited] = await fedThenRemoved("Edited", ["depository"], [
      { direction: "debit", primary: "FOOD_AND_DRINK", raw: { amount: 9, account_id: "itest-edit-feed" }, occurredAt: "2026-09-20T00:00:00Z" },
      // landed debit (raw 4), the user changed it to credit
      { direction: "credit", primary: "FOOD_AND_DRINK", raw: { amount: 4, account_id: "itest-edit-feed" }, occurredAt: "2026-09-19T00:00:00Z" },
    ]);
    // raw +9 coming in: an inverted feed.
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, userId, sample!, "in")).toMatchObject({ outcome: "resolved", convention: "inverted", released: 2 });
    expect(await row(sample!)).toMatchObject({ direction: "credit" });
    expect(await row(edited!)).toMatchObject({ status: "confirmed", direction: "credit" });
  });

  it("answers a row whose payload names no feed on its own, never with another row", async () => {
    const [a, b] = await fedThenRemoved("No feed", ["depository"], [
      { direction: "debit", raw: { amount: 3 } },
      { direction: "debit", raw: { amount: 6 } },
    ]);
    expect(await resolveDetachedHeldFromAnswer(db, unlocked, userId, a!, "out")).toMatchObject({ outcome: "resolved", released: 1 });
    expect(await row(a!)).toMatchObject({ status: "confirmed" });
    expect(await row(b!)).toMatchObject({ status: "pending_review" });
    const [audit] = await client<{ origin_account_ref: string }[]>`
      select origin_account_ref from public.detached_sign_answers where user_id = ${userId} and sample_transaction_id = ${a!}`;
    expect(audit!.origin_account_ref).toBe(`row:${a}`);
  });
});

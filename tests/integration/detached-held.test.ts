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
import { cleanupUser, client, db, insertBankTxn, mainAccountId, seedUser } from "./_db";

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
    expect(await resolveDetachedHeldFromAnswer(db, otherUserId, ids.anthropic, "out")).toEqual({ outcome: "not_found" });
    expect(await resolveDetachedHeldFromAnswer(db, userId, ids.legacy, "out")).toEqual({ outcome: "not_found" });
    expect(await changeDetachedHeldAnswer(db, userId, ids.anthropic, "in")).toEqual({ outcome: "not_answered" });
    expect((await row(ids.anthropic)).status).toBe("pending_review");
  });

  it("releases exactly its group, audited with the old values", async () => {
    expect(await resolveDetachedHeldFromAnswer(db, userId, ids.anthropic, "out")).toEqual({ outcome: "resolved", convention: "standard", released: 4 });
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
    expect(await resolveDetachedHeldFromAnswer(db, userId, ids.evo, "out")).toEqual({ outcome: "not_found" });
  });

  it("Change answer flips exactly the released rows, is idempotent, and changing back undoes it", async () => {
    expect(await changeDetachedHeldAnswer(db, userId, ids.anthropic, "out")).toEqual({ outcome: "unchanged" });
    expect(await changeDetachedHeldAnswer(db, userId, ids.anthropic, "in")).toEqual({ outcome: "changed", convention: "inverted", changedRows: 3 });
    for (const id of [ids.anthropic, ids.evo, ids.openai]) expect(await row(id)).toMatchObject({ direction: "credit", event_role: "REFUND" });
    expect(await row(ids.legacy)).toMatchObject({ direction: "debit" }); // its direction matches "standard" too, but the answer never set it
    expect(await changeDetachedHeldAnswer(db, userId, ids.openai, "out")).toEqual({ outcome: "changed", convention: "standard", changedRows: 3 });
    for (const id of [ids.anthropic, ids.evo, ids.openai]) expect(await row(id)).toMatchObject({ direction: "debit", event_role: "PURCHASE" });
    const kinds = await client<{ kind: string }[]>`select kind from public.detached_sign_answers where user_id = ${userId} order by created_at`;
    expect(kinds.map((k) => k.kind)).toEqual(["answer", "change", "change"]);
  });

  it("an inverted feed's answer flips its rows", async () => {
    // raw +30 on an inverted feed is money coming in.
    expect(await resolveDetachedHeldFromAnswer(db, userId, ids.otherFeed, "in")).toEqual({ outcome: "resolved", convention: "inverted", released: 1 });
    expect(await row(ids.otherFeed)).toMatchObject({ status: "confirmed", direction: "credit" });
  });
});

describe("prevention: reconnect adoption into an already-resolved account", () => {
  it("releases a held kept row with the new account's reading", async () => {
    const ext = `itest-old-${stamp}`;
    const heldId = await insertBankTxn(userId, checkingId, {
      plaidAccountId: null,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_COFFEE",
      occurredAt: "2026-09-20T00:00:00Z",
      raw: { amount: 7.5, account_id: ext, date: "2026-09-20", name: "Coffee" },
    });
    await new Promise((r) => setTimeout(r, 20)); // the new Plaid account is connected after the kept row was imported
    const [item] = await client<{ id: string }[]>`
      insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
      values (${userId}, ${`itest-detached-new-${stamp}`}, 'Synthetic Bank', 'enc-blob', 'active') returning id`;
    const newExt = `itest-new-${stamp}`;
    const [pa] = await client<{ id: string }[]>`
      insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type, sign_convention)
      values (${userId}, ${item.id}, ${newExt}, ${checkingId}, 'mapped', 'Checking', 'depository', 'inverted') returning id`;
    const ctx: NormalizeCtx = {
      accountMap: new Map([[newExt, { plaidAccountRowId: pa.id, budgtsAccountId: checkingId, ignored: false, signConvention: "inverted", accountType: "depository" }]]),
      currency: "USD",
      resolveCategory: () => null,
    };
    const txn: PlaidTxnInput = {
      transaction_id: `new-coffee-${stamp}`,
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
    };
    await runSync({
      userId,
      itemId: `itest-detached-new-${stamp}`,
      institutionId: null,
      initialCursor: null,
      transactionsSync: async () => ({ added: [txn], modified: [], removed: [], next_cursor: "c1", has_more: false }),
      store: createPlaidSyncStore(db),
      normalizeCtx: ctx,
    });
    // Adopted (one row, the kept one) and released with the inverted account's reading.
    expect(await row(heldId)).toMatchObject({ status: "confirmed", pending_reason: null, direction: "credit", plaid_account_id: pa.id });
    const [{ n }] = await client<{ n: number }[]>`select count(*)::int n from public.transactions where user_id = ${userId} and source_ref = ${`new-coffee-${stamp}`}`;
    expect(n).toBe(1);
  });
});

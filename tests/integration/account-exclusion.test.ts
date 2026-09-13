/**
 * DB-integration: setAccountCalculationExclusion (design: 2026-09-13
 * Advancial containment) against budgts-staging Postgres. Uses a
 * service-role client (RLS bypassed, as in this project's other
 * DB-integration suites) — proves the function's OWN explicit
 * `.eq("user_id", ...)` ownership check, not RLS, is what rejects a
 * cross-user call, and that excluding requires `needs_review: true` while
 * re-including does not.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setAccountCalculationExclusion } from "@/server/plaid/account-exclusion";
import { adminSupabase, cleanupUser, client, mainAccountId, seedUser } from "./_db";

const supabase = adminSupabase();

let userId: string;
let otherUserId: string;
let accountId: string;
let itemId: string;

beforeAll(async () => {
  userId = await seedUser();
  otherUserId = await seedUser();
  accountId = await mainAccountId(userId);
  const [item] = await client<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
    values (${userId}, ${`itest-item-${Date.now()}`}, 'Synthetic Bank', 'enc-blob', 'active', true) returning id`;
  itemId = item.id;
});

afterAll(async () => {
  await cleanupUser(userId);
  await cleanupUser(otherUserId);
});

async function insertPlaidAccount(over: { needsReview: boolean; excluded?: boolean }): Promise<string> {
  const [pa] = await client<{ id: string }[]>`
    insert into public.plaid_accounts
      (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, needs_review, excluded_from_calculations)
    values
      (${userId}, ${itemId}, ${`itest-pa-${crypto.randomUUID()}`}, ${accountId}, 'mapped', 'Checking',
       ${over.needsReview}, ${over.excluded ?? false})
    returning id`;
  return pa.id;
}

async function readAccount(id: string) {
  const [row] = await client<{ needs_review: boolean; excluded_from_calculations: boolean }[]>`
    select needs_review, excluded_from_calculations from public.plaid_accounts where id = ${id}`;
  return row;
}

describe("setAccountCalculationExclusion", () => {
  it("rejects excluding a non-needs_review account", async () => {
    const id = await insertPlaidAccount({ needsReview: false });

    const result = await setAccountCalculationExclusion(supabase, userId, id, true);
    expect(result.outcome).toBe("needs_review_required");

    const row = await readAccount(id);
    expect(row.excluded_from_calculations).toBe(false);
  });

  it("allows the owner to exclude a flagged (needs_review: true) account", async () => {
    const id = await insertPlaidAccount({ needsReview: true });

    const result = await setAccountCalculationExclusion(supabase, userId, id, true);
    expect(result.outcome).toBe("ok");

    const row = await readAccount(id);
    expect(row.excluded_from_calculations).toBe(true);
  });

  it("allows the owner to re-include an already-excluded account, no needs_review requirement", async () => {
    const id = await insertPlaidAccount({ needsReview: true, excluded: true });

    const result = await setAccountCalculationExclusion(supabase, userId, id, false);
    expect(result.outcome).toBe("ok");

    const row = await readAccount(id);
    expect(row.excluded_from_calculations).toBe(false);
  });

  it("rejects access to another user's Plaid account — ownership is checked explicitly, not left to RLS alone", async () => {
    const id = await insertPlaidAccount({ needsReview: true });

    const result = await setAccountCalculationExclusion(supabase, otherUserId, id, true);
    expect(result.outcome).toBe("not_found");

    // Nothing changed for the real owner's row.
    const row = await readAccount(id);
    expect(row.excluded_from_calculations).toBe(false);
  });

  it("reports 'not_found' for a genuinely nonexistent row", async () => {
    const result = await setAccountCalculationExclusion(
      supabase,
      userId,
      "00000000-0000-0000-0000-000000000000",
      true,
    );
    expect(result.outcome).toBe("not_found");
  });
});

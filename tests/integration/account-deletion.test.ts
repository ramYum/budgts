/**
 * Account deletion — the two-path lifecycle from
 * docs/specs/2026-09-19-account-deletion-design.md, against real staging
 * Postgres + the real Supabase Auth Admin API (never mocked — this is
 * exactly the boundary this design depends on behaving a specific way,
 * verified empirically before this was written).
 */
import { afterEach, describe, expect, it } from "vitest";
import { deleteAccount, hasMonetizationHistory } from "@/lib/account/delete-account";
import { adminSupabase } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/plaid/crypto";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { client as pg, categoryIdByName, mainAccountId } from "./_db";

const admin = adminSupabase();
const cleanupIds: string[] = [];

/**
 * A real Supabase Auth user, created through the same Admin API `deleteAccount`
 * itself calls — deliberately NOT `_db.ts`'s `seedUser()`, which inserts
 * directly into `auth.users` via raw SQL. That's fine for the rest of the
 * DB-integration suite (nothing else there calls `auth.admin.*`), but
 * `admin.auth.admin.getUserById()` returns 404 "User not found" for a
 * raw-inserted row (verified directly against staging before writing this) —
 * this suite specifically exercises that Admin API boundary, so it needs a
 * user GoTrue itself recognizes. The `handle_new_user` trigger still fires
 * either way, since it's a plain AFTER INSERT trigger on `auth.users`.
 */
async function createRealUser(): Promise<string> {
  const email = `itest-del+${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return data.user.id;
}

afterEach(async () => {
  // Belt-and-braces cleanup for any test that fails before reaching its own
  // cleanup — delete monetization rows first (RESTRICT), then hard-delete
  // whatever's left of the auth user (a no-op if it's already gone).
  for (const id of cleanupIds.splice(0)) {
    await pg`delete from public.subscriptions where user_id = ${id}`.catch(() => {});
    await admin.auth.admin.deleteUser(id, false).catch(() => {});
  }
});

async function seedPlaidItem(userId: string): Promise<string> {
  const itemId = `itest-item-${crypto.randomUUID()}`;
  const tokenEnc = encryptToken(`itest-fake-access-token-${crypto.randomUUID()}`, loadPlaidConfig().tokenEncKey);
  await pg`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
    values (${userId}, ${itemId}, 'Itest Bank', ${tokenEnc}, 'active')`;
  return itemId;
}

describe("hasMonetizationHistory", () => {
  it("is false for a plain user", async () => {
    const userId = await createRealUser();
    cleanupIds.push(userId);
    expect(await hasMonetizationHistory(admin, userId)).toBe(false);
  });

  it("is true once a subscriptions row exists", async () => {
    const userId = await createRealUser();
    cleanupIds.push(userId);
    await pg`
      insert into public.subscriptions (user_id, platform, platform_subscription_id, plan, status)
      values (${userId}, 'apple', ${"itest-sub-" + crypto.randomUUID()}, 'monthly', 'trialing')`;
    expect(await hasMonetizationHistory(admin, userId)).toBe(true);
  });
});

describe("deleteAccount — Path A (no monetization history)", () => {
  it("hard-deletes the auth user and cascades every owned table", async () => {
    const userId = await createRealUser();
    cleanupIds.push(userId);
    const accountId = await mainAccountId(userId);
    const categoryId = await categoryIdByName(userId, "Food / Groceries");
    const itemId = await seedPlaidItem(userId);

    await pg`insert into public.budgets (user_id, category_id, month, amount) values (${userId}, ${categoryId}, '2026-09-01', 10000)`;
    await pg`insert into public.savings_goals (user_id, name, target_amount) values (${userId}, 'itest goal', 5000)`;
    await pg`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
      values (${userId}, ${accountId}, ${categoryId}, 500, 'debit', now(), 'itest txn', 'manual')`;

    const result = await deleteAccount(admin, userId);
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });

    const { data: gone } = await admin.auth.admin.getUserById(userId);
    expect(gone.user).toBeNull();

    expect((await pg`select 1 from public.profiles where id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.accounts where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.categories where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.transactions where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.budgets where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.savings_goals where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.plaid_items where user_id = ${userId}`).length).toBe(0);
    // no dangling plaid item id left resolvable
    expect((await pg`select 1 from public.plaid_items where item_id = ${itemId}`).length).toBe(0);
  });

  it("is idempotent — a second call reports alreadyDeleted", async () => {
    const userId = await createRealUser();
    cleanupIds.push(userId);
    const first = await deleteAccount(admin, userId);
    expect(first.ok && !first.alreadyDeleted).toBe(true);

    const second = await deleteAccount(admin, userId);
    expect(second).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });
  });

  it("succeeds cleanly for a user with no Plaid connection", async () => {
    const userId = await createRealUser();
    cleanupIds.push(userId);
    const result = await deleteAccount(admin, userId);
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
  });
});

describe("deleteAccount — Path B (has monetization history)", () => {
  it("de-identifies the auth user, deletes owned data, and preserves the monetization row untouched", async () => {
    const userId = await createRealUser();
    cleanupIds.push(userId);
    const accountId = await mainAccountId(userId);
    const categoryId = await categoryIdByName(userId, "Food / Groceries");
    await seedPlaidItem(userId);
    await pg`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
      values (${userId}, ${accountId}, ${categoryId}, 500, 'debit', now(), 'itest txn', 'manual')`;

    const subId = crypto.randomUUID();
    const platformSubId = "itest-sub-" + crypto.randomUUID();
    await pg`
      insert into public.subscriptions (id, user_id, platform, platform_subscription_id, plan, status)
      values (${subId}, ${userId}, 'apple', ${platformSubId}, 'monthly', 'trialing')`;

    const before = await admin.auth.admin.getUserById(userId);
    const originalEmail = before.data.user?.email;

    const result = await deleteAccount(admin, userId);
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });

    // auth.users: still resolvable (RESTRICT satisfied), but de-identified.
    const { data: after } = await admin.auth.admin.getUserById(userId);
    expect(after.user).not.toBeNull();
    expect(after.user!.deleted_at).toBeTruthy();
    expect(after.user!.email).not.toBe(originalEmail);
    expect(after.user!.banned_until).toBeTruthy();

    // Owned application data is gone.
    expect((await pg`select 1 from public.transactions where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.accounts where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.categories where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.plaid_items where user_id = ${userId}`).length).toBe(0);
    expect((await pg`select 1 from public.profiles where id = ${userId}`).length).toBe(0);

    // The monetization row survives, completely unchanged, still valid.
    const [sub] = await pg`select id, user_id, status, plan from public.subscriptions where id = ${subId}`;
    expect(sub).toBeTruthy();
    expect(sub.user_id).toBe(userId);
    expect(sub.status).toBe("trialing");

    // The immutable-fact tables' triggers are untouched by this — proven by
    // the fact the row above still round-trips correctly through its own FK
    // to the (de-identified but not deleted) auth.users row.

    cleanupIds.length = 0; // this test does its own full cleanup below
    await pg`delete from public.subscriptions where id = ${subId}`;
    await admin.auth.admin.deleteUser(userId, false);
  });

  it("is idempotent — a second call reports alreadyDeleted without re-touching the ledger", async () => {
    const userId = await createRealUser();
    const subId = crypto.randomUUID();
    await pg`
      insert into public.subscriptions (id, user_id, platform, platform_subscription_id, plan, status)
      values (${subId}, ${userId}, 'google', ${"itest-sub-" + crypto.randomUUID()}, 'annual', 'active')`;

    const first = await deleteAccount(admin, userId);
    expect(first).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });

    const second = await deleteAccount(admin, userId);
    expect(second).toEqual({ ok: true, alreadyDeleted: true, path: "already-deleted" });

    const [sub] = await pg`select status from public.subscriptions where id = ${subId}`;
    expect(sub.status).toBe("active"); // untouched by either call

    await pg`delete from public.subscriptions where id = ${subId}`;
    await admin.auth.admin.deleteUser(userId, false);
  });
});

/**
 * Plaid Item removal against the REAL Plaid sandbox (fake banks) + real staging Postgres/Auth.
 *
 * Unit tests mock Plaid, so they can only prove the code reacts correctly to the errors we BELIEVE
 * Plaid returns. This file pins what Plaid ACTUALLY returns — most importantly that removing an
 * Item that is already gone answers ITEM_NOT_FOUND (idempotent success) while a token Plaid does not
 * know answers INVALID_ACCESS_TOKEN (must fail closed) — and proves that after a real deletion no
 * live Item is left at Plaid.
 *
 * Skipped unless PLAID_ENV=sandbox with credentials (so it can never run against production Plaid).
 */
import { afterEach, describe, expect, it } from "vitest";
import { Products } from "plaid";
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { encryptToken } from "@/lib/plaid/crypto";
import { readPlaidError } from "@/lib/plaid/error-policy";
import { deleteAccount } from "@/lib/account/delete-account";
import { adminSupabase } from "@/lib/supabase/admin";
import { disconnectPlaidItem } from "@/server/plaid/disconnect";
import { client as pg } from "./_db";

const sandbox =
  process.env.PLAID_ENV === "sandbox" &&
  !!process.env.PLAID_CLIENT_ID &&
  !!process.env.PLAID_SECRET &&
  !!process.env.PLAID_TOKEN_ENC_KEY;

const FIRST_PLATYPUS_BANK = "ins_109508"; // Plaid's sandbox institution

describe.skipIf(!sandbox)("Plaid Item removal against the real Plaid sandbox", () => {
  const admin = adminSupabase();
  const users: string[] = [];
  const liveTokens: string[] = [];

  afterEach(async () => {
    // Sandbox hygiene: never leave an Item behind, whatever the test did.
    for (const t of liveTokens.splice(0)) await plaidClient().itemRemove({ access_token: t }).catch(() => {});
    for (const id of users.splice(0)) await admin.auth.admin.deleteUser(id, false).catch(() => {});
  });

  async function mkUser(): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({ email: `itest-plaid+${crypto.randomUUID()}@example.test`, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    users.push(data.user.id);
    return data.user.id;
  }

  /** A real sandbox Item at Plaid. */
  async function realItem() {
    const pub = await plaidClient().sandboxPublicTokenCreate({ institution_id: FIRST_PLATYPUS_BANK, initial_products: [Products.Transactions] });
    const ex = await plaidClient().itemPublicTokenExchange({ public_token: pub.data.public_token });
    liveTokens.push(ex.data.access_token);
    return { accessToken: ex.data.access_token, itemId: ex.data.item_id };
  }

  async function storeItem(userId: string, itemId: string, accessToken: string) {
    await pg`insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
      values (${userId}, ${itemId}, 'Sandbox Bank', ${encryptToken(accessToken, loadPlaidConfig().tokenEncKey)}, 'active')`;
  }

  /** "alive", or the Plaid error code saying why the Item cannot be read. */
  async function statusAtPlaid(accessToken: string): Promise<string> {
    try {
      await plaidClient().itemGet({ access_token: accessToken });
      return "alive";
    } catch (e) {
      return readPlaidError(e)?.error_code ?? "unknown";
    }
  }

  const localRow = async (itemId: string) => (await pg`select 1 from public.plaid_items where item_id = ${itemId}`).length;

  it("strict removal of a REAL Item: Plaid no longer knows it afterwards, and the local row is deleted", async () => {
    const userId = await mkUser();
    const item = await realItem();
    await storeItem(userId, item.itemId, item.accessToken);
    expect(await statusAtPlaid(item.accessToken)).toBe("alive");

    const result = await disconnectPlaidItem(admin, { userId, itemId: item.itemId, strict: true });

    expect(result).toEqual({ ok: true, purged: false });
    expect(await statusAtPlaid(item.accessToken)).toBe("ITEM_NOT_FOUND");
    expect(await localRow(item.itemId)).toBe(0);
  });

  it("an Item that was ALREADY removed at Plaid is idempotent success (ITEM_NOT_FOUND): the local row is still cleared", async () => {
    const userId = await mkUser();
    const item = await realItem();
    await storeItem(userId, item.itemId, item.accessToken);
    await plaidClient().itemRemove({ access_token: item.accessToken }); // removed behind our back

    const result = await disconnectPlaidItem(admin, { userId, itemId: item.itemId, strict: true });

    expect(result).toEqual({ ok: true, purged: false });
    expect(await localRow(item.itemId)).toBe(0);
  });

  it("a token Plaid does not know (INVALID_ACCESS_TOKEN) is NOT 'already gone': strict removal fails and the local row is kept", async () => {
    const userId = await mkUser();
    const itemId = `itest-item-${crypto.randomUUID()}`;
    await storeItem(userId, itemId, "access-sandbox-00000000-0000-4000-8000-000000000000");

    const result = await disconnectPlaidItem(admin, { userId, itemId, strict: true });

    expect(result.ok).toBe(false);
    expect(await localRow(itemId)).toBe(1);
  });

  it("deleting an account removes EVERY real Item at Plaid, then the account: no live bank connection survives", async () => {
    const userId = await mkUser();
    const a = await realItem();
    const b = await realItem();
    await storeItem(userId, a.itemId, a.accessToken);
    await storeItem(userId, b.itemId, b.accessToken);

    const result = await deleteAccount(admin, userId);

    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(await statusAtPlaid(a.accessToken)).toBe("ITEM_NOT_FOUND");
    expect(await statusAtPlaid(b.accessToken)).toBe("ITEM_NOT_FOUND");
    expect(await localRow(a.itemId)).toBe(0);
    expect(await localRow(b.itemId)).toBe(0);
    expect((await admin.auth.admin.getUserById(userId)).data.user).toBeNull();
  });

  it("with one removable and one UNREMOVABLE Item, deletion refuses and stays retryable: after the user disconnects the bad Item, it completes and the good Item is gone", async () => {
    const userId = await mkUser();
    const good = await realItem();
    const badId = `itest-item-${crypto.randomUUID()}`;
    await storeItem(userId, good.itemId, good.accessToken);
    await storeItem(userId, badId, "access-sandbox-00000000-0000-4000-8000-000000000000");

    const first = await deleteAccount(admin, userId);

    expect(first.ok).toBe(false);
    expect((await admin.auth.admin.getUserById(userId)).data.user).not.toBeNull(); // the account is intact
    expect(await localRow(badId)).toBe(1); // the unremovable Item's row — the retry handle — is preserved

    // The user's own "disconnect bank" is the exit for an Item Plaid can no longer remove.
    expect(await disconnectPlaidItem(admin, { userId, itemId: badId })).toEqual({ ok: true, purged: false });

    expect(await deleteAccount(admin, userId)).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(await statusAtPlaid(good.accessToken)).toBe("ITEM_NOT_FOUND");
    expect((await admin.auth.admin.getUserById(userId)).data.user).toBeNull();
  });
});

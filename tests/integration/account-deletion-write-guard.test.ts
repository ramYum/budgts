/**
 * The database-authoritative deletion write guard — REAL staging Postgres, REAL PostgREST + RLS, REAL Auth.
 *
 * The problem: revoking a user's refresh sessions does not stop an access token that was already issued —
 * it stays valid until its `exp` (default one hour), and Row-Level Security only asks "is auth.uid() the row's
 * owner". For Path B the `auth.users` row is deliberately KEPT (the ledger's foreign keys point at it), so no
 * foreign key ever refuses a write from that stale token either. Signing the user out is therefore not enough:
 * a deleted account could keep accumulating data for up to an hour.
 *
 * The fix is state in the database, not in the token: a row in `account_deletions` makes every user-originated
 * INSERT/UPDATE/DELETE fail through a RESTRICTIVE policy, whatever the JWT says. These tests use a genuine access
 * token issued BEFORE deletion started, through the same PostgREST path the apps use.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deleteAccount } from "@/lib/account/delete-account";
import { adminSupabase } from "@/lib/supabase/admin";
import { client as pg } from "./_db";

const admin = adminSupabase();
const cleanupIds: string[] = [];

afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    await pg`delete from public.subscriptions where user_id = ${id}`.catch(() => {});
    await pg`delete from public.account_deletions where user_id = ${id}`.catch(() => {});
    await admin.auth.admin.deleteUser(id, false).catch(() => {});
  }
}, 60_000);

/** A real user plus a genuine, already-issued access token, and a PostgREST client that presents it. */
async function userWithToken() {
  const email = `itest-guard+${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const userId = data.user.id;
  cleanupIds.push(userId);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.properties?.hashed_token) throw link.error ?? new Error("no magic-link token");
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const session = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  const accessToken = session.data.session?.access_token;
  if (session.error || !accessToken) throw session.error ?? new Error("no session issued");

  const asUser: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  return { userId, asUser };
}

const goalCount = async (userId: string) =>
  (await pg<{ n: number }[]>`select count(*)::int n from public.savings_goals where user_id = ${userId}`)[0].n;

describe("deletion write guard — a stale access token cannot write once deletion has started", () => {
  it("control: before deletion starts, the user's token can create, change and remove its own data", async () => {
    const { userId, asUser } = await userWithToken();

    const ins = await asUser.from("savings_goals").insert({ user_id: userId, name: "itest goal", target_amount: 100 }).select("id").single();
    expect(ins.error, JSON.stringify(ins.error)).toBeNull();
    const upd = await asUser.from("savings_goals").update({ name: "renamed" }).eq("id", ins.data!.id).select("id");
    expect(upd.data).toHaveLength(1);
    const del = await asUser.from("savings_goals").delete().eq("id", ins.data!.id).select("id");
    expect(del.data).toHaveLength(1);
  }, 60_000);

  it("once a deletion row exists, the SAME token is refused for INSERT, UPDATE and DELETE (reads still work)", async () => {
    const { userId, asUser } = await userWithToken();
    const seeded = await asUser.from("savings_goals").insert({ user_id: userId, name: "kept", target_amount: 100 }).select("id").single();
    expect(seeded.error).toBeNull();

    await pg`insert into public.account_deletions (user_id, state) values (${userId}, 'deleting')`;

    const ins = await asUser.from("savings_goals").insert({ user_id: userId, name: "late", target_amount: 1 }).select("id");
    expect(ins.error?.code, `insert must be refused by RLS, got: ${JSON.stringify(ins)}`).toBe("42501");

    const upd = await asUser.from("savings_goals").update({ name: "tampered" }).eq("id", seeded.data!.id).select("id");
    expect(upd.data ?? [], "an UPDATE must affect no rows").toHaveLength(0);
    const del = await asUser.from("savings_goals").delete().eq("id", seeded.data!.id).select("id");
    expect(del.data ?? [], "a DELETE must affect no rows").toHaveLength(0);

    // The row is exactly as it was, and the user can still READ it (the UI needs that to show deletion progress).
    const [row] = await pg<{ name: string }[]>`select name from public.savings_goals where id = ${seeded.data!.id}`;
    expect(row.name).toBe("kept");
    const read = await asUser.from("savings_goals").select("id");
    expect(read.data).toHaveLength(1);
    expect(await goalCount(userId)).toBe(1);
  }, 60_000);

  it("after a COMPLETED Path B deletion, a token issued before it still cannot create data for the retained user row", async () => {
    const { userId, asUser } = await userWithToken();
    await pg`insert into public.subscriptions (user_id, platform, platform_subscription_id, plan, status)
      values (${userId}, 'apple', ${"itest-sub-" + crypto.randomUUID()}, 'monthly', 'active')`;

    const result = await deleteAccount(admin, userId);
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });

    // The auth user still exists (the ledger needs it) and the old token has not expired...
    const ins = await asUser.from("savings_goals").insert({ user_id: userId, name: "after deletion", target_amount: 1 }).select("id");
    expect(ins.error?.code, JSON.stringify(ins)).toBe("42501");
    const prof = await asUser.from("profiles").upsert({ id: userId, currency: "USD" }).select("id");
    expect(prof.error?.code ?? "no error", "profiles is a write target too").not.toBe("no error");
    expect(await goalCount(userId)).toBe(0);
  }, 90_000);
});

describe("deletion write guard — the state table and function are not reachable by ordinary users", () => {
  it("an authenticated user cannot read, insert or change account_deletions rows", async () => {
    const { userId, asUser } = await userWithToken();
    await pg`insert into public.account_deletions (user_id, state) values (${userId}, 'deleting')`;

    const read = await asUser.from("account_deletions").select("user_id");
    expect(read.data ?? []).toHaveLength(0); // deny-all RLS: not even the user's own row
    const clear = await asUser.from("account_deletions").delete().eq("user_id", userId).select("user_id");
    expect(clear.data ?? [], "a user must not be able to clear their own deletion lock").toHaveLength(0);
    const forge = await asUser.from("account_deletions").insert({ user_id: userId, state: "deleted" });
    expect(forge.error).not.toBeNull();
    expect((await pg`select 1 from public.account_deletions where user_id = ${userId}`).length).toBe(1);
  }, 60_000);

  it("the guard function is executable by authenticated (RLS needs it) but not by anon or PUBLIC", async () => {
    const [p] = await pg<{ auth: boolean; anon: boolean; pub: boolean; definer: boolean; path: string | null }[]>`
      select has_function_privilege('authenticated', 'public.account_accepts_writes()', 'execute') as auth,
             has_function_privilege('anon', 'public.account_accepts_writes()', 'execute') as anon,
             has_function_privilege('public', 'public.account_accepts_writes()', 'execute') as pub,
             prosecdef as definer,
             (select option_value from pg_options_to_table(proconfig) where option_name = 'search_path') as path
      from pg_proc where oid = 'public.account_accepts_writes()'::regprocedure`;
    expect(p).toEqual({ auth: true, anon: false, pub: false, definer: true, path: '""' });
  });

  it("every table that lets an authenticated user write has the guard policies (bank-connection DELETE is the one documented exception)", async () => {
    // Coverage guard for the future: a new user-owned table with a normal "own rows" policy but no deletion guard
    // would silently reopen the stale-token window. Deny-all tables (using false) cannot be written and need none.
    // The exception: a locked user must still be able to DELETE a bank connection (migration 0020) — it is the
    // escape hatch when Plaid cannot remove an Item, and deleting a row creates no data.
    const exempt: Record<string, string[]> = { plaid_items: ["DELETE"] };
    const writable = await pg<{ tablename: string }[]>`
      select distinct tablename from pg_policies
      where schemaname = 'public' and permissive = 'PERMISSIVE' and 'authenticated' = any(roles)
        and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE') and coalesce(qual, with_check) is distinct from 'false'`;
    expect(writable.length).toBeGreaterThan(0);
    const unguarded: string[] = [];
    for (const { tablename } of writable) {
      const guards = await pg<{ cmd: string }[]>`
        select cmd from pg_policies
        where schemaname = 'public' and tablename = ${tablename} and permissive = 'RESTRICTIVE'
          and (coalesce(qual, '') || coalesce(with_check, '')) like '%account_accepts_writes%'`;
      const cmds = new Set(guards.map((g) => g.cmd));
      for (const c of ["INSERT", "UPDATE", "DELETE"]) {
        const shouldBeGuarded = !exempt[tablename]?.includes(c);
        if (shouldBeGuarded && !cmds.has(c)) unguarded.push(`${tablename}:${c}`);
        if (!shouldBeGuarded && cmds.has(c)) unguarded.push(`${tablename}:${c} (guarded, but documented as exempt)`);
      }
    }
    expect(unguarded, "writable tables missing a deletion guard policy").toEqual([]);
  });
});

describe("deletion write guard — a locked user is never stranded", () => {
  it("can still DELETE a bank connection (the escape hatch), but cannot CONNECT one or change it", async () => {
    const { userId, asUser } = await userWithToken();
    const itemId = `itest-item-${crypto.randomUUID()}`;
    await pg`insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
      values (${userId}, ${itemId}, 'Itest Bank', 'x', 'active')`;
    await pg`insert into public.account_deletions (user_id, state) values (${userId}, 'deleting')`;

    const connect = await asUser.from("plaid_items").insert({ user_id: userId, item_id: `itest-item-${crypto.randomUUID()}`, access_token_enc: "x", status: "active" });
    expect(connect.error?.code, "connecting a bank while deleting must be refused").toBe("42501");
    const change = await asUser.from("plaid_items").update({ institution_name: "renamed" }).eq("item_id", itemId).select("id");
    expect(change.data ?? [], "changing a connection while deleting must be refused").toHaveLength(0);

    const disconnect = await asUser.from("plaid_items").delete().eq("item_id", itemId).select("id");
    expect(disconnect.error).toBeNull();
    expect(disconnect.data, "the user must be able to remove a bank Plaid cannot").toHaveLength(1);
  }, 60_000);
});

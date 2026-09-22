/**
 * POST /api/account/delete — the REAL route handler against real staging: real Supabase Auth (real
 * Bearer tokens minted through a magic-link verification), the real service-role admin client, and the
 * real database. Nothing about identity, freshness or configuration is faked, so this proves the
 * behaviour a customer would actually get.
 *
 * Complements src/app/api/account/delete/route.test.ts (fast unit tests with fakes) and
 * account-deletion.test.ts (the deleteAccount function itself).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { encryptToken } from "@/lib/plaid/crypto";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { client as pg, categoryIdByName, mainAccountId } from "./_db";

// The route falls back to the cookie session when there is no Bearer token; outside a Next request
// there is no cookie store, so give it an empty one (== "no session cookie").
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const created: string[] = [];
const savedSecret = process.env.SUPABASE_SECRET_KEY;

afterEach(async () => {
  process.env.SUPABASE_SECRET_KEY = savedSecret;
  for (const id of created.splice(0)) {
    await pg`delete from public.subscriptions where user_id = ${id}`.catch(() => {});
    await admin.auth.admin.deleteUser(id, false).catch(() => {});
  }
});

/** A fresh copy of the route (and of the admin client it caches), reading the CURRENT process.env. */
async function loadRoute() {
  vi.resetModules();
  return (await import("@/app/api/account/delete/route")).POST;
}

type Actor = { id: string; email: string; token: string };

/** A real user with a real, fresh session: the token comes from completing a magic-link verification. */
async function mkActor(tag: string): Promise<Actor> {
  const email = `itest-del-route+${tag}-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  created.push(data.user.id);

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link) throw linkErr ?? new Error("generateLink failed");
  const { data: verified, error: verr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (verr || !verified.session) throw verr ?? new Error("verifyOtp produced no session");
  return { id: data.user.id, email, token: verified.session.access_token };
}

async function seed(u: Actor) {
  const accountId = await mainAccountId(u.id);
  const categoryId = await categoryIdByName(u.id, "Food / Groceries");
  await pg`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${u.id}, ${accountId}, ${categoryId}, 4200, 'debit', now(), 'itest route txn', 'manual')`;
  await pg`insert into public.budgets (user_id, category_id, month, amount) values (${u.id}, ${categoryId}, '2026-09-01', 9000)`;
  await pg`insert into public.savings_goals (user_id, name, target_amount) values (${u.id}, 'itest goal', 5000)`;
}

/** A Plaid Item whose token decrypts but that Plaid does not know: Plaid cannot remove it (INVALID_ACCESS_TOKEN). */
async function seedUnremovablePlaidItem(u: Actor): Promise<string> {
  const itemId = `itest-item-${crypto.randomUUID()}`;
  const enc = encryptToken(`access-sandbox-${crypto.randomUUID()}`, loadPlaidConfig().tokenEncKey);
  await pg`insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status)
    values (${u.id}, ${itemId}, 'Itest Bank', ${enc}, 'active')`;
  return itemId;
}

async function counts(id: string) {
  const n = async (table: string, col = "user_id") => (await pg.unsafe(`select count(*)::int n from public.${table} where ${col} = $1`, [id]))[0].n as number;
  return {
    profiles: await n("profiles", "id"),
    accounts: await n("accounts"),
    categories: await n("categories"),
    transactions: await n("transactions"),
    budgets: await n("budgets"),
    savings_goals: await n("savings_goals"),
    plaid_items: await n("plaid_items"),
  };
}
const authUser = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user;

const post = (POST: (r: Request) => Promise<Response>, token: string | null, body?: unknown) =>
  POST(
    new Request("https://example.test/api/account/delete", {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const allZero = (c: Record<string, number>) => Object.values(c).every((v) => v === 0);

describe("POST /api/account/delete against real staging — authentication and step-up", () => {
  it("401 for an unauthenticated request and for a forged Bearer token; a bystander's data is untouched", async () => {
    const bystander = await mkActor("bystander");
    await seed(bystander);
    const before = await counts(bystander.id);
    const POST = await loadRoute();

    expect((await post(POST, null)).status).toBe(401);
    expect((await post(POST, "forged.token.value")).status).toBe(401);

    expect(await counts(bystander.id)).toEqual(before);
    expect(await authUser(bystander.id)).not.toBeNull();
  });

  it("403 reauth_required when the sign-in is older than the step-up window, and NOTHING is deleted", async () => {
    const stale = await mkActor("stale");
    await seed(stale);
    const before = await counts(stale.id);
    await pg`update auth.users set last_sign_in_at = now() - interval '11 minutes' where id = ${stale.id}`;
    const POST = await loadRoute();

    const res = await post(POST, stale.token);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("reauth_required");
    expect(await counts(stale.id)).toEqual(before);
    expect(await authUser(stale.id)).not.toBeNull();
  });
});

describe("POST /api/account/delete against real staging — deleting, isolation and retry", () => {
  it("hard-deletes ONLY the caller (auth user and every owned row); a userId smuggled into the body is ignored; the bystander is identical before and after", async () => {
    const victim = await mkActor("self");
    const bystander = await mkActor("bystander");
    await seed(victim);
    await seed(bystander);
    const bystanderBefore = await counts(bystander.id);
    const POST = await loadRoute();

    const res = await post(POST, victim.token, { userId: bystander.id, user_id: bystander.id, id: bystander.id });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(await authUser(victim.id)).toBeNull();
    expect(allZero(await counts(victim.id))).toBe(true);
    expect(await counts(bystander.id)).toEqual(bystanderBefore);
    expect(await authUser(bystander.id)).not.toBeNull();
  });

  it("anonymizes an account that has monetization history: de-identified and banned, owned data gone, the ledger row untouched", async () => {
    const u = await mkActor("history");
    await seed(u);
    const subId = crypto.randomUUID();
    await pg`insert into public.subscriptions (id, user_id, platform, platform_subscription_id, plan, status)
      values (${subId}, ${u.id}, 'apple', ${"itest-sub-" + crypto.randomUUID()}, 'monthly', 'trialing')`;
    const POST = await loadRoute();

    const res = await post(POST, u.token);

    expect(res.status).toBe(200);
    expect((await res.json()).path).toBe("anonymize");
    const after = await authUser(u.id);
    expect(after?.deleted_at).toBeTruthy();
    expect(after?.banned_until).toBeTruthy();
    expect(after?.email).not.toBe(u.email);
    expect(allZero(await counts(u.id))).toBe(true);
    const [sub] = await pg`select status from public.subscriptions where id = ${subId}`;
    expect(sub.status).toBe("trialing");
  });

  it("retry is safe: after a completed deletion the same token no longer resolves, so it is a clean 401 — never a 500, never a second deletion", async () => {
    const u = await mkActor("retry");
    const other = await mkActor("other");
    await seed(other);
    const otherBefore = await counts(other.id);
    const POST = await loadRoute();

    expect((await post(POST, u.token)).status).toBe(200);
    const again = await post(POST, u.token);

    expect(again.status).toBe(401);
    expect(await counts(other.id)).toEqual(otherBefore);
  });
});

describe("POST /api/account/delete against real staging — nothing is destroyed when a prerequisite fails", () => {
  it("B1 — missing admin key: a generic 503, and the account, its data and its Plaid item are all intact", async () => {
    const u = await mkActor("noadmin");
    await seed(u);
    const itemId = await seedUnremovablePlaidItem(u);
    const before = await counts(u.id);
    delete process.env.SUPABASE_SECRET_KEY;
    const POST = await loadRoute();

    const res = await post(POST, u.token);
    const body = await res.text();

    expect(res.status).toBe(503);
    expect(body).not.toMatch(/SUPABASE|secret|admin|key|env|config/i); // nothing about configuration reaches the client
    expect(await counts(u.id)).toEqual(before);
    expect((await pg`select 1 from public.plaid_items where item_id = ${itemId}`).length).toBe(1);
    expect(await authUser(u.id)).not.toBeNull();
  });

  it("a WRONG admin key: the first Auth call fails, it is reported as a failure (not 'already deleted'), and nothing is destroyed", async () => {
    const u = await mkActor("wrongkey");
    await seed(u);
    const itemId = await seedUnremovablePlaidItem(u);
    const before = await counts(u.id);
    process.env.SUPABASE_SECRET_KEY = "sb_secret_this_is_not_a_real_key_000000000";
    const POST = await loadRoute();

    const res = await post(POST, u.token);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "could not delete account" });
    expect(await counts(u.id)).toEqual(before);
    expect((await pg`select 1 from public.plaid_items where item_id = ${itemId}`).length).toBe(1);
  });

  it("B3 — an Item Plaid cannot remove: a generic 500, the account stays fully usable, and the Item's row (the retry handle) is preserved", async () => {
    const u = await mkActor("plaidfail");
    await seed(u);
    const itemId = await seedUnremovablePlaidItem(u);
    const before = await counts(u.id);
    const POST = await loadRoute();

    const res = await post(POST, u.token);
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: "could not delete account" });
    expect(body).not.toMatch(/plaid|bank|item|token/i);
    expect(await counts(u.id)).toEqual(before);
    expect((await pg`select 1 from public.plaid_items where item_id = ${itemId}`).length).toBe(1);
    expect((await authUser(u.id))?.deleted_at).toBeFalsy();
  });
});

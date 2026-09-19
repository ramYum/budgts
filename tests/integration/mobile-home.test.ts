/**
 * `GET /api/mobile/home` against REAL staging Supabase: real Auth tokens, real
 * RLS, real Postgres — nothing mocked. Proves the claims the unit tests can't:
 * that an authenticated mobile caller sees ONLY their own dashboard data, that
 * a client-supplied id changes nothing, and that the numbers are the
 * authoritative dashboard math.
 *
 * Two synthetic users get deliberately different rows; every assertion is about
 * whose rows came back. Tokens are minted the way the mobile app obtains them
 * (magic-link verification), not hand-built.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/mobile/home/route";
import { adminSupabase } from "@/lib/supabase/admin";
import { categoryIdByName, cleanupUser, client, mainAccountId } from "./_db";

const admin = adminSupabase();
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type Actor = { id: string; token: string; marker: string };
let a: Actor;
let b: Actor;

async function mintActor(marker: string): Promise<Actor> {
  const email = `itest-mobile-home+${crypto.randomUUID()}@example.test`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link) throw linkErr ?? new Error("generateLink returned nothing");
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !verified.session) throw verifyErr ?? new Error("verifyOtp produced no session");

  return { id: created.user.id, token: verified.session.access_token, marker };
}

async function seedRows(actor: Actor, income: number, spend: number) {
  const accountId = await mainAccountId(actor.id);
  const salary = await categoryIdByName(actor.id, "Salary");
  const food = await categoryIdByName(actor.id, "Food / Groceries");
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${salary}, ${income}, 'credit', now(), ${`${actor.marker} paycheck`}, 'manual')`;
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${food}, ${spend}, 'debit', now(), ${`${actor.marker} groceries`}, 'manual')`;
}

function call(token: string | null, query = "") {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return GET(new Request(`https://example.test/api/mobile/home${query}`, { headers }));
}

beforeAll(async () => {
  a = await mintActor("ALICE-ITEST");
  b = await mintActor("BOB-ITEST");
  // Distinct amounts so any cross-user leak changes a number, not just a label.
  await seedRows(a, 123_400, 5_600);
  await seedRows(b, 777_700, 88_800);
}, 60_000);

afterAll(async () => {
  for (const actor of [a, b]) {
    if (!actor) continue;
    await admin.auth.admin.deleteUser(actor.id, false).catch(() => {});
    await cleanupUser(actor.id).catch(() => {});
  }
});

describe("GET /api/mobile/home (real staging)", () => {
  it("rejects a request with no token", async () => {
    const res = await call(null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a forged token", async () => {
    const res = await call("not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's own dashboard — authoritative Money Left, own rows only", async () => {
    const res = await call(a.token);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.version).toBe(1);
    expect(body.income).toBe(123_400);
    expect(body.spent).toBe(5_600);
    expect(body.moneyLeft).toBe(123_400 - 5_600);

    const descriptions = body.recent.map((r: { description: string }) => r.description);
    expect(descriptions).toContain("ALICE-ITEST groceries");
    expect(JSON.stringify(body)).not.toContain("BOB-ITEST");
    expect(JSON.stringify(body)).not.toContain("777700");
    expect(JSON.stringify(body)).not.toContain("88800");
  });

  it("the other user gets only their own data", async () => {
    const body = await (await call(b.token)).json();

    expect(body.moneyLeft).toBe(777_700 - 88_800);
    expect(JSON.stringify(body)).toContain("BOB-ITEST");
    expect(JSON.stringify(body)).not.toContain("ALICE-ITEST");
    expect(JSON.stringify(body)).not.toContain("123400");
  });

  it("a client-supplied user id cannot redirect the read (B asking for A still gets B)", async () => {
    const res = await call(b.token, `?userId=${a.id}&user_id=${a.id}&id=${a.id}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.moneyLeft).toBe(777_700 - 88_800);
    expect(JSON.stringify(body)).not.toContain("ALICE-ITEST");
  });

  it("is never cacheable", async () => {
    expect((await call(a.token)).headers.get("cache-control")).toBe("private, no-store");
  });
});

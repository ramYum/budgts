/**
 * The native data API against REAL staging Supabase: real Auth tokens, real RLS, real Postgres — nothing mocked. Proves
 * what the unit tests can't: an authenticated native caller sees ONLY their own data, a client-supplied id changes
 * nothing, the month is the user's own (their stored time zone), and the numbers are exactly the ones the web Home
 * computes (the same `loadHome`, here run through the user's own RLS-scoped client as the web page does).
 *
 * Two synthetic users get deliberately different rows; every assertion is about whose rows came back. Tokens are minted
 * the way the app obtains them (magic-link verification), not hand-built.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// GET /api/mobile/home schedules the web Home's refresh nudge with next/server `after`, which needs a live request scope that
// a direct route call here doesn't have; the nudge itself is covered by src/app/api/mobile/home/route.test.ts.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
import { GET as getHome } from "@/app/api/mobile/home/route";
import { GET as getBudgets } from "@/app/api/mobile/budgets/route";
import { GET as getTransactions, POST as postTransaction } from "@/app/api/mobile/transactions/route";
import { bearerClient } from "@/lib/auth/bearer-context";
import { currentMonthKey } from "@/lib/budget/month";
import { loadHome } from "@/lib/home/load-home";
import { buildMobileHome } from "@/lib/mobile/home";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { parseMobileHome } from "../../mobile/lib/home/contract";
import { adminSupabase, categoryIdByName, cleanupUser, client, mainAccountId } from "./_db";

const admin = adminSupabase();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Actor = { id: string; token: string; marker: string; zone: string };
let a: Actor;
let b: Actor;

async function mintActor(marker: string, zone: string): Promise<Actor> {
  const email = `itest-mobile-home+${crypto.randomUUID()}@example.test`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link) throw linkErr ?? new Error("generateLink returned nothing");
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !verified.session) throw verifyErr ?? new Error("verifyOtp produced no session");

  await client`update public.profiles set onboarded_at = now(), time_zone = ${zone} where id = ${created.user.id}`;
  return { id: created.user.id, token: verified.session.access_token, marker, zone };
}

/** Mid-month of the actor's current month (in their zone), so the rows are "this month" whatever the UTC date. */
function midMonth(zone: string): string {
  return `${currentMonthKey(zone)}-15T12:00:00Z`;
}

async function seedRows(actor: Actor, income: number, spend: number, refund: number) {
  const accountId = await mainAccountId(actor.id);
  const salary = await categoryIdByName(actor.id, "Salary");
  const food = await categoryIdByName(actor.id, "Food / Groceries");
  const at = midMonth(actor.zone);
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${salary}, ${income}, 'credit', ${at}, ${`${actor.marker} paycheck`}, 'manual')`;
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${food}, ${spend}, 'debit', ${at}, ${`${actor.marker} groceries`}, 'manual')`;
  // A refund reverses spending in its category rather than counting as income.
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${food}, ${refund}, 'credit', ${at}, ${`${actor.marker} refund`}, 'manual')`;
  // A transfer between own accounts is never spending.
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source, is_transfer)
    values (${actor.id}, ${accountId}, null, 50000, 'debit', ${at}, ${`${actor.marker} to savings`}, 'manual', true)`;
  await client`insert into public.budgets (user_id, category_id, month, amount)
    values (${actor.id}, ${food}, ${`${currentMonthKey(actor.zone)}-01`}, 40000)`;
}

const bearer = (token: string | null, path: string, init: RequestInit = {}) =>
  new Request(`https://example.test${path}`, {
    ...init,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
  });

beforeAll(async () => {
  a = await mintActor("ALICE-ITEST", "Pacific/Kiritimati");
  b = await mintActor("BOB-ITEST", "America/Los_Angeles");
  // Distinct amounts so any cross-user leak changes a number, not just a label. A's net grocery spend, $50.00 of a $400.00
  // budget, is a non-whole 12.5% used: the share real budgets usually have, which the app must accept as sent.
  await seedRows(a, 123_400, 5_600, 600);
  await seedRows(b, 777_700, 88_800, 800);
}, 90_000);

afterAll(async () => {
  for (const actor of [a, b]) {
    if (!actor) continue;
    await admin.auth.admin.deleteUser(actor.id, false).catch(() => {});
    await cleanupUser(actor.id).catch(() => {});
  }
});

describe("GET /api/mobile/home (real staging)", () => {
  it("rejects a request with no token, and a forged one", async () => {
    expect((await getHome(bearer(null, "/api/mobile/home"))).status).toBe(401);
    expect((await getHome(bearer("not-a-real-token", "/api/mobile/home"))).status).toBe(401);
  });

  it("returns the user's own Home: authoritative Money Left, refund netted, transfer excluded, own rows only", async () => {
    const res = await getHome(bearer(a.token, "/api/mobile/home"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();

    expect(body.month).toBe(currentMonthKey(a.zone));
    expect(body.income).toBe(123_400);
    expect(body.spent).toBe(5_600 - 600);
    expect(body.moneyLeft).toBe(123_400 - (5_600 - 600));
    expect(body.budgeted).toBe(40_000);

    const text = JSON.stringify(body);
    expect(text).toContain("ALICE-ITEST groceries");
    expect(text).not.toContain("BOB-ITEST");
    expect(text).not.toContain("777700");
  });

  it("matches the web Home exactly: the same loadHome over the same user's RLS-scoped client", async () => {
    const api = await (await getHome(bearer(b.token, "/api/mobile/home"))).json();
    const web = await loadHome(bearerClient(b.token), { userId: b.id, timeZone: b.zone, plaidEnabled: plaidUiEnabled() });
    expect(web.degraded).toEqual([]);
    expect(api).toEqual(JSON.parse(JSON.stringify(buildMobileHome(web))));
    expect(api.moneyLeft).toBe(web.view.tiles.netSavings);
  });

  it("sends a real budget's share unrounded (12.5%), and the app's Home contract accepts the body as sent", async () => {
    const body = await (await getHome(bearer(a.token, "/api/mobile/home"))).json();
    const food = body.categories.find((c: { name: string }) => c.name === "Food / Groceries");
    expect(food).toMatchObject({ budget: 40_000, actual: 5_000, remaining: 35_000, pctUsed: 12.5 });
    expect(parseMobileHome(body).categories.find((c) => c.name === "Food / Groceries")?.pctUsed).toBe(12.5);
  });

  it("a client-supplied user id cannot redirect the read (B asking for A still gets B)", async () => {
    const res = await getHome(bearer(b.token, `/api/mobile/home?userId=${a.id}&user_id=${a.id}&id=${a.id}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.moneyLeft).toBe(777_700 - (88_800 - 800));
    expect(JSON.stringify(body)).not.toContain("ALICE-ITEST");
  });
});

describe("budgets and transactions over the native API (real staging)", () => {
  it("budgets carry the same numbers as Home for the month", async () => {
    const home = await (await getHome(bearer(a.token, "/api/mobile/home"))).json();
    const budgets = await (await getBudgets(bearer(a.token, "/api/mobile/budgets"))).json();
    expect(budgets.month).toBe(home.month);
    expect(budgets.spent).toBe(home.spent);
    expect(budgets.budgeted).toBe(home.budgeted);
    expect(budgets.leftToSpend).toBe(home.leftToSpend);
  });

  it("lists only the caller's transactions for their current month", async () => {
    const res = await getTransactions(bearer(b.token, "/api/mobile/transactions"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.month).toBe(currentMonthKey(b.zone));
    const descriptions = body.items.map((t: { description: string }) => t.description);
    expect(descriptions).toEqual(expect.arrayContaining(["BOB-ITEST paycheck", "BOB-ITEST groceries"]));
    expect(JSON.stringify(body)).not.toContain("ALICE-ITEST");
  });

  it("a retried create with the same requestId lands exactly once (no duplicate economic event)", async () => {
    const accountId = await mainAccountId(a.id);
    const requestId = crypto.randomUUID(); // exactly what the app sends (mobile lib/transactions/form.ts newRequestId)
    const body = JSON.stringify({
      accountId,
      categoryId: null,
      amount: "4.20",
      direction: "debit",
      occurredAt: midMonth(a.zone).slice(0, 10),
      description: "ALICE-ITEST retried coffee",
      note: "",
      isTransfer: false,
      requestId,
    });
    const first = await postTransaction(bearer(a.token, "/api/mobile/transactions", { method: "POST", body }));
    const second = await postTransaction(bearer(a.token, "/api/mobile/transactions", { method: "POST", body }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const [one, two] = [await first.json(), await second.json()];
    expect(two.id).toBe(one.id);
    expect([one.replayed, two.replayed]).toEqual([false, true]); // the retry is told nothing new was written
    const rows = await client`select id from public.transactions where user_id = ${a.id} and description = 'ALICE-ITEST retried coffee'`;
    expect(rows).toHaveLength(1);
  });
});

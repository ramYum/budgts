/**
 * Stage 2B's native screen endpoints against REAL staging Supabase: real Auth tokens, real RLS, real Postgres, nothing
 * mocked. For each new endpoint it proves what the unit tests can't:
 *  - number parity: the API returns exactly what the web page's own loader computes for the same user (the loaders the
 *    web pages now call, run through the user's own RLS-scoped client as the pages do), and the figures match the seeded
 *    rows computed by hand;
 *  - isolation: user B never sees, and can never change, user A's rows (a foreign id is a 404 that writes nothing);
 *  - idempotency: a retried create with the same requestId lands once.
 *
 * Two synthetic users with deliberately different numbers; tokens are minted the way the app obtains them.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// GET /api/mobile/activity schedules the web's refresh nudge with next/server `after`, which needs a live request scope that a
// direct route call here doesn't have; the nudge itself is covered by src/app/api/mobile/activity/route.test.ts.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
import { GET as getGoals, POST as postGoal } from "@/app/api/mobile/goals/route";
import { PATCH as patchGoal } from "@/app/api/mobile/goals/[id]/route";
import { POST as postContribution } from "@/app/api/mobile/goals/[id]/contributions/route";
import { GET as getInsights } from "@/app/api/mobile/insights/route";
import { GET as getHome } from "@/app/api/mobile/home/route";
import { GET as getBudgets } from "@/app/api/mobile/budgets/route";
import { POST as postCategory } from "@/app/api/mobile/categories/route";
import { PATCH as patchCategory } from "@/app/api/mobile/categories/[id]/route";
import { GET as getCategorySettings } from "@/app/api/mobile/settings/categories/route";
import { GET as getTour, POST as postTour } from "@/app/api/mobile/tour/route";
import { GET as getProfile } from "@/app/api/mobile/profile/route";
import { GET as getHub } from "@/app/api/mobile/hub/route";
import { GET as getDeleteScreen } from "@/app/api/mobile/account/delete/route";
import { GET as getExport } from "@/app/api/mobile/export/transactions/route";
import { GET as getStatus } from "@/app/api/mobile/status/route";
import { GET as getActivity } from "@/app/api/mobile/activity/route";
import { GET as getOverview } from "@/app/api/mobile/accounts/overview/route";
import { POST as postCategorize } from "@/app/api/mobile/transactions/[id]/categorize/route";
import { PUT as putBudget } from "@/app/api/mobile/budgets/route";
import { GET as getTransactions, POST as postTransaction } from "@/app/api/mobile/transactions/route";
import { PATCH as patchTransaction } from "@/app/api/mobile/transactions/[id]/route";
import { POST as postMap } from "@/app/api/mobile/plaid/accounts/map/route";
import { bearerClient } from "@/lib/auth/bearer-context";
import { currentMonthKey, todayDateKey } from "@/lib/budget/month";
import { loadBudgets } from "@/lib/budgets/load-budgets";
import { loadGoals } from "@/lib/goals/load-goals";
import { loadInsights } from "@/lib/insights/load-insights";
import { loadHome } from "@/lib/home/load-home";
import { buildMobileGoals } from "@/lib/mobile/goals";
import { buildMobileInsights } from "@/lib/mobile/insights";
import { buildMobileHome } from "@/lib/mobile/home";
import { buildMobileBudgets } from "@/lib/mobile/reads";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { adminSupabase, categoryIdByName, cleanupUser, client, insertBankTxn, mainAccountId } from "./_db";

const admin = adminSupabase();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Actor = { id: string; token: string; marker: string; zone: string };
let a: Actor;
let b: Actor;

async function mintActor(marker: string, zone: string): Promise<Actor> {
  const email = `itest-mobile-screens+${crypto.randomUUID()}@example.test`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link) throw linkErr ?? new Error("generateLink returned nothing");
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (verifyErr || !verified.session) throw verifyErr ?? new Error("verifyOtp produced no session");
  await client`update public.profiles set onboarded_at = now(), time_zone = ${zone} where id = ${created.user.id}`;
  return { id: created.user.id, token: verified.session.access_token, marker, zone };
}

const midMonth = (zone: string) => `${currentMonthKey(zone)}-15T12:00:00Z`;

async function seedMoney(actor: Actor, income: number, spend: number, refund: number) {
  const accountId = await mainAccountId(actor.id);
  const salary = await categoryIdByName(actor.id, "Salary");
  const food = await categoryIdByName(actor.id, "Food / Groceries");
  const at = midMonth(actor.zone);
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${salary}, ${income}, 'credit', ${at}, ${`${actor.marker} paycheck`}, 'manual')`;
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${food}, ${spend}, 'debit', ${at}, ${`${actor.marker} groceries`}, 'manual')`;
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
    values (${actor.id}, ${accountId}, ${food}, ${refund}, 'credit', ${at}, ${`${actor.marker} refund`}, 'manual')`;
  await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source, is_transfer)
    values (${actor.id}, ${accountId}, null, 50000, 'debit', ${at}, ${`${actor.marker} to savings`}, 'manual', true)`;
  await client`insert into public.budgets (user_id, category_id, month, amount)
    values (${actor.id}, ${food}, ${`${currentMonthKey(actor.zone)}-01`}, 40000)`;
}

const call = (token: string | null, path: string, init: { method?: string; body?: unknown } = {}) =>
  new Request(`https://example.test${path}`, {
    method: init.method ?? "GET",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

let goalA: string;

beforeAll(async () => {
  a = await mintActor("ALICE-SCREENS", "Pacific/Kiritimati");
  b = await mintActor("BOB-SCREENS", "America/Los_Angeles");
  await seedMoney(a, 123_400, 5_600, 600);
  await seedMoney(b, 777_700, 88_800, 800);
}, 90_000);

afterAll(async () => {
  for (const actor of [a, b]) {
    if (!actor) continue;
    await admin.auth.admin.deleteUser(actor.id, false).catch(() => {});
    await cleanupUser(actor.id).catch(() => {});
  }
});

describe("goals (real staging)", () => {
  it("creates a goal once per requestId, and adds / withdraws contributions exactly once each", async () => {
    const requestId = crypto.randomUUID();
    const body = { name: "ALICE-SCREENS trip", targetAmount: "1,000", targetDate: null, requestId };
    const first = await postGoal(call(a.token, "/api/mobile/goals", { method: "POST", body }));
    const second = await postGoal(call(a.token, "/api/mobile/goals", { method: "POST", body }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = await first.json();
    goalA = firstBody.id;
    expect(firstBody.replayed).toBe(false);
    // the retry is told it was a replay (the app says "This was already saved…")
    expect(await second.json()).toEqual({ id: goalA, replayed: true });
    expect(await client`select id from public.savings_goals where user_id = ${a.id}`).toHaveLength(1);

    const today = todayDateKey(a.zone);
    const add = { kind: "add", amount: "400", occurredAt: today, note: null, requestId: crypto.randomUUID() };
    for (const replayed of [false, true]) {
      const res = await postContribution(call(a.token, `/api/mobile/goals/${goalA}/contributions`, { method: "POST", body: add }), idParams(goalA));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: add.requestId, replayed });
    }
    const take = { kind: "withdraw", amount: "150.50", occurredAt: today, note: "fix", requestId: crypto.randomUUID() };
    await postContribution(call(a.token, `/api/mobile/goals/${goalA}/contributions`, { method: "POST", body: take }), idParams(goalA));
    const rows = await client<{ amount: number }[]>`select amount from public.savings_contributions where user_id = ${a.id} order by amount`;
    expect(rows.map((r) => r.amount)).toEqual([-15050, 40000]);
  });

  it("returns exactly the web Goals page's numbers (the same loadGoals over the same RLS client)", async () => {
    const res = await getGoals(call(a.token, "/api/mobile/goals"));
    expect(res.status).toBe(200);
    const api = await res.json();
    const web = await loadGoals(bearerClient(a.token), a.id);
    expect(api).toEqual(JSON.parse(JSON.stringify(buildMobileGoals(web, todayDateKey(a.zone)))));
    expect(api.goals).toHaveLength(1);
    expect(api.goals[0]).toMatchObject({ id: goalA, target: 100_000, saved: 40_000 - 15_050, remaining: 100_000 - 24_950, pct: 25 });
    expect(api.summary).toEqual({ totalTarget: 100_000, totalSaved: 24_950, activeCount: 1, completeCount: 0 });
    expect(api.today).toBe(todayDateKey(a.zone));
  });

  it("B can neither see, edit, archive nor add money to A's goal", async () => {
    const bGoals = await (await getGoals(call(b.token, `/api/mobile/goals?userId=${a.id}`))).json();
    expect(bGoals.goals).toEqual([]);
    expect(JSON.stringify(bGoals)).not.toContain("ALICE");
    expect((await patchGoal(call(b.token, `/api/mobile/goals/${goalA}`, { method: "PATCH", body: { archived: true } }), idParams(goalA))).status).toBe(404);
    expect(
      (await patchGoal(call(b.token, `/api/mobile/goals/${goalA}`, { method: "PATCH", body: { name: "pwned", targetAmount: "1", targetDate: "" } }), idParams(goalA))).status,
    ).toBe(404);
    const steal = { kind: "add", amount: "1", occurredAt: todayDateKey(b.zone), note: null };
    expect((await postContribution(call(b.token, `/api/mobile/goals/${goalA}/contributions`, { method: "POST", body: steal }), idParams(goalA))).status).toBe(404);
    const [goal] = await client<{ name: string; is_archived: boolean }[]>`select name, is_archived from public.savings_goals where id = ${goalA}`;
    expect(goal).toEqual({ name: "ALICE-SCREENS trip", is_archived: false });
    expect(await client`select id from public.savings_contributions where user_id = ${b.id}`).toHaveLength(0);
  });

  it("Home's savings card agrees with Goals", async () => {
    const home = await (await getHome(call(a.token, "/api/mobile/home"))).json();
    expect(home.savings).toEqual({ activeCount: 1, totalSaved: 24_950, totalTarget: 100_000 });
  });
});

describe("insights, budgets and home figures (real staging)", () => {
  it("Insights matches the web page's loadInsights exactly, and the hand-computed numbers", async () => {
    const api = await (await getInsights(call(a.token, "/api/mobile/insights"))).json();
    const web = await loadInsights(bearerClient(a.token), { userId: a.id, timeZone: a.zone, plaidEnabled: plaidUiEnabled() });
    expect(web.degraded).toEqual([]);
    expect(api).toEqual(JSON.parse(JSON.stringify(buildMobileInsights(web))));
    expect(api.month).toBe(currentMonthKey(a.zone));
    expect(api.income).toBe(123_400);
    expect(api.spent).toBe(5_600 - 600); // the refund nets; the transfer is not spending
    expect(api.moneyLeft).toBe(123_400 - 5_000);
    expect(api.incomeSources).toEqual([{ name: "Salary", color: expect.any(String), amount: 123_400, share: 100 }]);
    expect(api.breakdown.reduce((s: number, x: { share: number }) => s + x.share, 0)).toBe(100);
    expect(JSON.stringify(api)).not.toContain("777700");
  });

  it("Budgets matches the web page's loadBudgets exactly, and agrees with Home and Insights", async () => {
    const api = await (await getBudgets(call(b.token, "/api/mobile/budgets"))).json();
    const web = await loadBudgets(bearerClient(b.token), { userId: b.id, timeZone: b.zone, range: "month", plaidEnabled: plaidUiEnabled() });
    if (web.range !== "month") throw new Error("expected the month view");
    expect(web.degraded).toEqual([]);
    expect(api).toEqual(JSON.parse(JSON.stringify(buildMobileBudgets(web))));
    expect(api.spent).toBe(88_800 - 800);
    expect(api.budgeted).toBe(40_000);
    expect(api.leftToSpend).toBe(40_000 - 88_000);
    expect(api.tone).toBe("over");

    const home = await (await getHome(call(b.token, "/api/mobile/home"))).json();
    const insights = await (await getInsights(call(b.token, "/api/mobile/insights"))).json();
    expect(home.spent).toBe(api.spent);
    expect(insights.spent).toBe(api.spent);
    expect(home.moneyLeft).toBe(insights.moneyLeft);

    const all = await (await getBudgets(call(b.token, "/api/mobile/budgets?range=all"))).json();
    expect(all.range).toBe("all");
    expect(all.allTime).toEqual([{ categoryId: expect.any(String), name: "Food / Groceries", color: expect.any(String), total: 88_000 }]);
  });

  it("Home's added cards match loadHome, and a browsed month is the requested one", async () => {
    const api = await (await getHome(call(a.token, "/api/mobile/home"))).json();
    const web = await loadHome(bearerClient(a.token), { userId: a.id, timeZone: a.zone, plaidEnabled: plaidUiEnabled() });
    expect(api).toEqual(JSON.parse(JSON.stringify(buildMobileHome(web))));
    expect(api.trend).toHaveLength(6);
    expect(api.trendChange.total).toBe(5_000);
    const past = await (await getHome(call(a.token, "/api/mobile/home?month=2001-02"))).json();
    expect(past.month).toBe("2001-02");
    expect(past.spent).toBe(0);
  });
});

describe("categories (real staging)", () => {
  let catA: string;

  it("creates once per requestId, renames, archives, and lists archived ones with this month's counts", async () => {
    const requestId = crypto.randomUUID();
    const body = { name: "ALICE-SCREENS pets", kind: "expense", color: "#22c55e", requestId };
    const [one, two] = [
      await postCategory(call(a.token, "/api/mobile/categories", { method: "POST", body })),
      await postCategory(call(a.token, "/api/mobile/categories", { method: "POST", body })),
    ];
    expect(one.status).toBe(201);
    catA = (await one.json()).id;
    expect((await two.json()).id).toBe(catA);
    expect(await client`select id from public.categories where user_id = ${a.id} and name = 'ALICE-SCREENS pets'`).toHaveLength(1);

    const rename = { name: "ALICE-SCREENS pet care", kind: "expense", color: "#3b82f6" };
    expect((await patchCategory(call(a.token, `/api/mobile/categories/${catA}`, { method: "PATCH", body: rename }), idParams(catA))).status).toBe(200);
    expect((await patchCategory(call(a.token, `/api/mobile/categories/${catA}`, { method: "PATCH", body: { archived: true } }), idParams(catA))).status).toBe(200);

    const settings = await (await getCategorySettings(call(a.token, "/api/mobile/settings/categories"))).json();
    expect(settings.month).toBe(currentMonthKey(a.zone));
    const mine = settings.categories.find((c: { id: string }) => c.id === catA);
    expect(mine).toEqual({ id: catA, name: "ALICE-SCREENS pet care", kind: "expense", color: "#3b82f6", archived: true, txnCount: 0 });
    const food = settings.categories.find((c: { name: string }) => c.name === "Food / Groceries");
    expect(food.txnCount).toBe(2); // the purchase and the refund
  });

  it("B cannot rename or archive A's category, nor see it", async () => {
    const res = await patchCategory(call(b.token, `/api/mobile/categories/${catA}`, { method: "PATCH", body: { archived: false } }), idParams(catA));
    expect(res.status).toBe(404);
    const [row] = await client<{ is_archived: boolean }[]>`select is_archived from public.categories where id = ${catA}`;
    expect(row.is_archived).toBe(true);
    const bSettings = await (await getCategorySettings(call(b.token, "/api/mobile/settings/categories"))).json();
    expect(JSON.stringify(bSettings)).not.toContain("ALICE");
  });
});

describe("tour, profile, hub, export (real staging)", () => {
  it("the welcome guide gate flips once the guide is finished, for the caller only", async () => {
    expect((await (await getProfile(call(a.token, "/api/mobile/profile"))).json()).tourSeen).toBe(false);
    const tour = await (await getTour(call(a.token, "/api/mobile/tour"))).json();
    expect(tour.seen).toBe(false);
    expect(tour.stepIds.length).toBeGreaterThan(0);
    expect((await postTour(call(a.token, "/api/mobile/tour", { method: "POST" }))).status).toBe(200);
    expect((await (await getProfile(call(a.token, "/api/mobile/profile"))).json()).tourSeen).toBe(true);
    expect((await (await getProfile(call(b.token, "/api/mobile/profile"))).json()).tourSeen).toBe(false);
  });

  it("the Delete account screen's first state comes from the network-checked user", async () => {
    const res = await getDeleteScreen(call(a.token, "/api/mobile/account/delete"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const { data } = await admin.auth.admin.getUserById(a.id);
    expect(body).toMatchObject({ email: data.user!.email, recent: true, google: false, inProgress: false });
    expect((await getDeleteScreen(call("not-a-token", "/api/mobile/account/delete"))).status).toBe(401);
  });

  it("the hub counts are the caller's own", async () => {
    const hub = await (await getHub(call(a.token, "/api/mobile/hub"))).json();
    expect(hub).toMatchObject({ goals: 1, budgets: 1 });
    expect((await (await getHub(call(b.token, "/api/mobile/hub"))).json()).goals).toBe(0);
  });

  it("the CSV export holds the caller's rows only, dated with their own today", async () => {
    const res = await getExport(call(b.token, "/api/mobile/export/transactions"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="budgts-transactions-${todayDateKey(b.zone)}.csv"`);
    const csv = await res.text();
    expect(csv).toContain("BOB-SCREENS groceries");
    expect(csv).not.toContain("ALICE");
    expect(csv.trim().split("\r\n")).toHaveLength(1 + 4);
  });
});

describe("status, activity, accounts overview, categorize (real staging)", () => {
  it("status and activity answer for a fresh account", async () => {
    const status = await (await getStatus(call(a.token, "/api/mobile/status"))).json();
    expect(status.deletionInProgress).toBe(false);
    expect(status.review).toEqual({ advisory: null, excluded: null });
    const activity = await getActivity(call(a.token, "/api/mobile/activity"));
    expect(activity.status).toBe(200);
  });

  it("the accounts overview lists the caller's accounts with this month's counts", async () => {
    const o = await (await getOverview(call(a.token, "/api/mobile/accounts/overview"))).json();
    const accountId = await mainAccountId(a.id);
    const byHand = o.groups.find((g: { key: string }) => g.key === "by-hand");
    expect(byHand.accounts.find((x: { id: string }) => x.id === accountId).txnCount).toBe(4);
    const bIds = await client<{ id: string }[]>`select id from public.accounts where user_id = ${b.id}`;
    expect(JSON.stringify(o)).not.toContain(bIds[0]!.id);
  });

  it("categorizing an imported row marks it user-set; B cannot categorize A's row", async () => {
    const accountId = await mainAccountId(a.id);
    const food = await categoryIdByName(a.id, "Food / Groceries");
    const txn = await insertBankTxn(a.id, accountId, { description: "ALICE-SCREENS bank coffee", occurredAt: midMonth(a.zone) });
    const denied = await postCategorize(call(b.token, `/api/mobile/transactions/${txn}/categorize`, { method: "POST", body: { categoryId: food } }), idParams(txn));
    expect(denied.status).toBe(404);
    const ok = await postCategorize(call(a.token, `/api/mobile/transactions/${txn}/categorize`, { method: "POST", body: { categoryId: food } }), idParams(txn));
    expect(ok.status).toBe(200);
    const [row] = await client<{ category_id: string; user_categorized: boolean }[]>`select category_id, user_categorized from public.transactions where id = ${txn}`;
    expect(row).toEqual({ category_id: food, user_categorized: true });
  });
});

describe("client-supplied ids that point at another table must be the caller's own (real staging)", () => {
  // Foreign keys ignore RLS, so without the app-layer check (src/lib/ownership.ts) each of these would store B's row
  // pointing at A's account or category. Each must answer 404 and write nothing.
  it("B cannot budget against, or record a transaction into, A's category or account", async () => {
    const aFood = await categoryIdByName(a.id, "Food / Groceries");
    const aAccount = await mainAccountId(a.id);
    const bAccount = await mainAccountId(b.id);
    const bFood = await categoryIdByName(b.id, "Food / Groceries");

    const budget = await putBudget(
      call(b.token, "/api/mobile/budgets", { method: "PUT", body: { categoryId: aFood, month: currentMonthKey(b.zone), amount: "1" } }),
    );
    expect(budget.status).toBe(404);
    expect(await client`select id from public.budgets where user_id = ${b.id} and category_id = ${aFood}`).toHaveLength(0);

    const base = { amount: "1.23", direction: "debit", occurredAt: todayDateKey(b.zone), description: "BOB-SCREENS foreign ref", note: "", isTransfer: false };
    for (const refs of [{ accountId: aAccount, categoryId: bFood }, { accountId: bAccount, categoryId: aFood }]) {
      const res = await postTransaction(call(b.token, "/api/mobile/transactions", { method: "POST", body: { ...base, ...refs } }));
      expect(res.status).toBe(404);
    }
    expect(await client`select id from public.transactions where user_id = ${b.id} and description = 'BOB-SCREENS foreign ref'`).toHaveLength(0);

    // Update: B's own row cannot be pointed at A's category.
    const items = (await (await getTransactions(call(b.token, "/api/mobile/transactions"))).json()).items as { id: string; description: string }[];
    const own = items.find((t) => t.description === "BOB-SCREENS groceries")!;
    const res = await patchTransaction(
      call(b.token, `/api/mobile/transactions/${own.id}`, { method: "PATCH", body: { ...base, accountId: bAccount, categoryId: aFood } }),
      idParams(own.id),
    );
    expect(res.status).toBe(404);
    const [row] = await client<{ category_id: string }[]>`select category_id from public.transactions where id = ${own.id}`;
    expect(row.category_id).toBe(bFood);
  });

  it("B cannot categorize its bank row with A's category (nor write a merchant rule with it)", async () => {
    const aFood = await categoryIdByName(a.id, "Food / Groceries");
    const bAccount = await mainAccountId(b.id);
    const txn = await insertBankTxn(b.id, bAccount, {
      description: "BOB-SCREENS bank",
      merchantEntityId: "itest-merchant-foreign",
      occurredAt: midMonth(b.zone),
    });
    const res = await postCategorize(
      call(b.token, `/api/mobile/transactions/${txn}/categorize`, { method: "POST", body: { categoryId: aFood } }),
      idParams(txn),
    );
    expect(res.status).toBe(404);
    const [row] = await client<{ category_id: string | null; user_categorized: boolean }[]>`
      select category_id, user_categorized from public.transactions where id = ${txn}`;
    expect(row).toEqual({ category_id: null, user_categorized: false });
    expect(await client`select 1 from public.plaid_merchant_rules where user_id = ${b.id}`).toHaveLength(0);
  });

  it("B cannot map its bank account onto A's account", async () => {
    const aAccount = await mainAccountId(a.id);
    const [item] = await client<{ id: string }[]>`
      insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
      values (${b.id}, ${`itest-item-${crypto.randomUUID()}`}, 'Synthetic Bank', 'enc-blob', 'active', false) returning id`;
    const plaidAccountId = `itest-pa-${crypto.randomUUID()}`;
    await client`insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name)
      values (${b.id}, ${item.id}, ${plaidAccountId}, null, 'unmapped', 'Checking')`;
    const res = await postMap(
      call(b.token, "/api/mobile/plaid/accounts/map", {
        method: "POST",
        body: { plaidItemId: item.id, entries: [{ plaidAccountId, mode: "existing", existingAccountId: aAccount }] },
      }),
    );
    // The hotfix's check (mapAccountsFor, ab07cb3): a target that isn't the caller's own open account is refused as
    // "no longer available" (422), the same answer as the caller's own archived account, so nothing about A leaks.
    expect(res.status).toBe(422);
    const [pa] = await client<{ account_id: string | null; link_state: string }[]>`
      select account_id, link_state from public.plaid_accounts where plaid_account_id = ${plaidAccountId}`;
    expect(pa).toEqual({ account_id: null, link_state: "unmapped" });
  });
});

describe("the figures ignore every row the web ignores (filter-drift guard, real staging)", () => {
  let c: Actor;

  beforeAll(async () => {
    c = await mintActor("CAROL-SCREENS", "Europe/Berlin");
    const accountId = await mainAccountId(c.id);
    const salary = await categoryIdByName(c.id, "Salary");
    const food = await categoryIdByName(c.id, "Food / Groceries");
    const at = midMonth(c.zone);
    await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
      values (${c.id}, ${accountId}, ${salary}, 100000, 'credit', ${at}, 'CAROL pay', 'manual')`;
    const real = await insertBankTxn(c.id, accountId, { categoryId: food, amount: 10_000, occurredAt: at, description: "CAROL real" });
    // An owner-excluded bank account's row, a row held for review, a confirmed duplicate and a Plaid-removed row:
    // none may count toward spending anywhere.
    const [item] = await client<{ id: string }[]>`
      insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
      values (${c.id}, ${`itest-item-${crypto.randomUUID()}`}, 'Synthetic Bank', 'enc-blob', 'active', false) returning id`;
    const [excluded] = await client<{ id: string }[]>`
      insert into public.plaid_accounts
        (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, needs_review, excluded_from_calculations)
      values (${c.id}, ${item.id}, ${`itest-pa-${crypto.randomUUID()}`}, ${accountId}, 'mapped', 'Flaky card', true, true)
      returning id`;
    await insertBankTxn(c.id, accountId, { categoryId: food, amount: 7_777, occurredAt: at, plaidAccountId: excluded.id, description: "CAROL excluded" });
    await insertBankTxn(c.id, accountId, {
      categoryId: food,
      amount: 3_333,
      occurredAt: at,
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      description: "CAROL held",
    });
    await insertBankTxn(c.id, accountId, { categoryId: food, amount: 10_000, occurredAt: at, duplicateOfId: real, description: "CAROL duplicate" });
    await insertBankTxn(c.id, accountId, {
      categoryId: food,
      amount: 5_555,
      occurredAt: at,
      removedAt: new Date().toISOString(),
      description: "CAROL removed",
    });
  }, 60_000);

  afterAll(async () => {
    if (!c) return;
    await admin.auth.admin.deleteUser(c.id, false).catch(() => {});
    await cleanupUser(c.id).catch(() => {});
  });

  it("Home, Insights and Budgets count only the real purchase, and each equals its web loader", async () => {
    const home = await (await getHome(call(c.token, "/api/mobile/home"))).json();
    const insights = await (await getInsights(call(c.token, "/api/mobile/insights"))).json();
    const budgets = await (await getBudgets(call(c.token, "/api/mobile/budgets"))).json();
    for (const screen of [home, insights, budgets]) expect(screen.spent).toBe(10_000);
    expect(home.moneyLeft).toBe(90_000);
    expect(insights.moneyLeft).toBe(90_000);

    const rls = bearerClient(c.token);
    const opts = { userId: c.id, timeZone: c.zone, plaidEnabled: plaidUiEnabled() };
    expect(home).toEqual(JSON.parse(JSON.stringify(buildMobileHome(await loadHome(rls, opts)))));
    expect(insights).toEqual(JSON.parse(JSON.stringify(buildMobileInsights(await loadInsights(rls, opts)))));
    const web = await loadBudgets(rls, { ...opts, range: "month" });
    if (web.range !== "month") throw new Error("expected the month view");
    expect(budgets).toEqual(JSON.parse(JSON.stringify(buildMobileBudgets(web))));

    const status = await (await getStatus(call(c.token, "/api/mobile/status"))).json();
    expect(status.review.excluded).toMatch(/^Flaky card is excluded from your financial totals/);
  });
});

describe("while an account deletion holds the lock, writes answer 423 account_locked (real staging)", () => {
  let d: Actor;
  let goal: string;
  let txn: string;
  let food: string;

  beforeAll(async () => {
    d = await mintActor("DAVE-SCREENS", "UTC");
    food = await categoryIdByName(d.id, "Food / Groceries");
    goal = (await (await postGoal(call(d.token, "/api/mobile/goals", { method: "POST", body: { name: "DAVE goal", targetAmount: "100", targetDate: null } }))).json()).id;
    const accountId = await mainAccountId(d.id);
    txn = (
      await (
        await postTransaction(
          call(d.token, "/api/mobile/transactions", {
            method: "POST",
            body: { accountId, categoryId: food, amount: "10", direction: "debit", occurredAt: todayDateKey(d.zone), description: "DAVE coffee", note: "", isTransfer: false },
          }),
        )
      ).json()
    ).id;
    // The lock a started deletion takes (migration 0021's write guard reads this row).
    await client`insert into public.account_deletions (user_id, state) values (${d.id}, 'deleting')`;
  }, 60_000);

  afterAll(async () => {
    if (!d) return;
    await client`delete from public.account_deletions where user_id = ${d.id}`.catch(() => {});
    await admin.auth.admin.deleteUser(d.id, false).catch(() => {});
    await cleanupUser(d.id).catch(() => {});
  });

  it("an edit, a transaction edit, a budget and a contribution are refused with 423 and nothing is written", async () => {
    const rename = await patchGoal(
      call(d.token, `/api/mobile/goals/${goal}`, { method: "PATCH", body: { name: "DAVE renamed", targetAmount: "100", targetDate: null } }),
      idParams(goal),
    );
    expect(rename.status).toBe(423);
    expect(await rename.json()).toEqual({ error: "account_locked" });

    const accountId = await mainAccountId(d.id);
    const edit = await patchTransaction(
      call(d.token, `/api/mobile/transactions/${txn}`, {
        method: "PATCH",
        body: { accountId, categoryId: food, amount: "99", direction: "debit", occurredAt: todayDateKey(d.zone), description: "DAVE edited", note: "", isTransfer: false },
      }),
      idParams(txn),
    );
    expect(edit.status).toBe(423);

    const budget = await putBudget(call(d.token, "/api/mobile/budgets", { method: "PUT", body: { categoryId: food, month: currentMonthKey(d.zone), amount: "50" } }));
    expect(budget.status).toBe(423);

    const add = await postContribution(
      call(d.token, `/api/mobile/goals/${goal}/contributions`, { method: "POST", body: { kind: "add", amount: "5", occurredAt: todayDateKey(d.zone), note: null } }),
      idParams(goal),
    );
    expect(add.status).toBe(423);

    const [g] = await client<{ name: string }[]>`select name from public.savings_goals where id = ${goal}`;
    expect(g.name).toBe("DAVE goal");
    const [t] = await client<{ description: string; amount: number }[]>`select description, amount from public.transactions where id = ${txn}`;
    expect(t).toEqual({ description: "DAVE coffee", amount: 1000 });
    expect(await client`select id from public.budgets where user_id = ${d.id}`).toHaveLength(0);
    expect(await client`select id from public.savings_contributions where user_id = ${d.id}`).toHaveLength(0);
  });
});

describe("the Activity ledger pages in the web's order (real staging)", () => {
  let e: Actor;

  beforeAll(async () => {
    e = await mintActor("ERIN-SCREENS", "UTC");
    const accountId = await mainAccountId(e.id);
    const food = await categoryIdByName(e.id, "Food / Groceries");
    const at = midMonth(e.zone);
    // Manual entries on one day share occurred_at (noon UTC). Three single inserts get three created_at values; the
    // two-row insert shares one created_at (now() is per statement), so only the id orders that pair.
    for (const d of ["first", "second", "third"]) {
      await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
        values (${e.id}, ${accountId}, ${food}, 100, 'debit', ${at}, ${`ERIN ${d}`}, 'manual')`;
    }
    await client`insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
      values (${e.id}, ${accountId}, ${food}, 100, 'debit', ${at}, 'ERIN pair a', 'manual'),
             (${e.id}, ${accountId}, ${food}, 100, 'debit', ${at}, 'ERIN pair b', 'manual')`;
  }, 60_000);

  afterAll(async () => {
    if (!e) return;
    await admin.auth.admin.deleteUser(e.id, false).catch(() => {});
    await cleanupUser(e.id).catch(() => {});
  });

  it("orders same-time rows by created_at then id, one page at a time, every row once", async () => {
    const web = await client<{ id: string }[]>`select id from public.transactions where user_id = ${e.id}
      order by occurred_at desc, created_at desc, id desc`;
    const month = currentMonthKey(e.zone);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const q: string = `/api/mobile/transactions?month=${month}&limit=1${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await getTransactions(call(e.token, q));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { id: string }[]; nextCursor: string | null };
      seen.push(...body.items.map((t) => t.id));
      cursor = body.nextCursor;
    } while (cursor && seen.length <= web.length);
    expect(seen).toEqual(web.map((r) => r.id));
    expect(seen).toHaveLength(5);
  });
});

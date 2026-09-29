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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    goalA = (await first.json()).id;
    expect((await second.json()).id).toBe(goalA);
    expect(await client`select id from public.savings_goals where user_id = ${a.id}`).toHaveLength(1);

    const today = todayDateKey(a.zone);
    const add = { kind: "add", amount: "400", occurredAt: today, note: null, requestId: crypto.randomUUID() };
    for (let i = 0; i < 2; i++) {
      expect((await postContribution(call(a.token, `/api/mobile/goals/${goalA}/contributions`, { method: "POST", body: add }), idParams(goalA))).status).toBe(201);
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

/**
 * Live contract test for Stage 2B's native screen endpoints (docs/specs/2026-09-17-mobile-app-launch-design.md §6)
 * against a real deployed server: real HTTP, real Supabase-issued Bearer tokens, real PostgREST + RLS. Covers, per new
 * route: no answer without a token; cross-user isolation (B never sees or changes A's data, a foreign id is a 404);
 * idempotent creates (a retried requestId lands once); and the figures matching what was entered.
 *
 * Uses Playwright's `request` fixture (no browser). Point it at STAGING only (`PLAYWRIGHT_BASE_URL`); it creates and deletes
 * its own throwaway users.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, mintAccessToken } from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY");

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ZONE = "UTC";
const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<Body> {
  return (await res.json()) as Body;
}

test("no new screen route answers without a Bearer token", async ({ request }) => {
  const zero = "00000000-0000-4000-8000-000000000000";
  for (const path of [
    "/goals",
    "/insights",
    "/settings/categories",
    "/tour",
    "/hub",
    "/export/transactions",
    "/status",
    "/activity",
    "/accounts/overview",
    "/account/delete",
  ]) {
    expect((await request.get(`/api/mobile${path}`)).status(), path).toBe(401);
  }
  for (const path of ["/goals", `/goals/${zero}/contributions`, "/categories", "/tour", `/transactions/${zero}/categorize`, "/transactions/rescan"]) {
    expect((await request.post(`/api/mobile${path}`, { data: {} })).status(), path).toBe(401);
  }
  expect((await request.patch(`/api/mobile/goals/${zero}`, { data: { archived: true } })).status()).toBe(401);
  expect((await request.patch(`/api/mobile/categories/${zero}`, { data: { archived: true } })).status()).toBe(401);
  expect((await request.delete(`/api/mobile/plaid/accounts/${zero}/review`)).status()).toBe(401);
});

test("screen endpoints end to end, with cross-user isolation and idempotent creates", async ({ request }) => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const headersA = auth(await mintAccessToken(a.email));
    const headersB = auth(await mintAccessToken(b.email));
    for (const headers of [headersA, headersB]) {
      expect((await request.post("/api/mobile/onboarding", { headers, data: { currency: "USD", time_zone: ZONE } })).status()).toBe(200);
    }

    // ── welcome guide ─────────────────────────────────────────────────────────────────────────────────────────
    expect((await json(await request.get("/api/mobile/profile", { headers: headersA }))).tourSeen).toBe(false);
    const tour = await json(await request.get("/api/mobile/tour?new=1", { headers: headersA }));
    expect(tour).toMatchObject({ phase: "tour", seen: false, currency: "USD" });
    expect(tour.stepIds.length).toBeGreaterThan(0);
    expect((await request.post("/api/mobile/tour", { headers: headersA })).status()).toBe(200);
    expect((await request.post("/api/mobile/tour", { headers: headersA })).status()).toBe(200); // safe to repeat
    expect((await json(await request.get("/api/mobile/profile", { headers: headersA }))).tourSeen).toBe(true);
    expect((await json(await request.get("/api/mobile/profile", { headers: headersB }))).tourSeen).toBe(false);

    // ── goals: create once per requestId, contributions once each ──────────────────────────────────────────
    const goalReq = crypto.randomUUID();
    const goalBody = { name: "E2E trip", targetAmount: "500", targetDate: null, requestId: goalReq };
    let res = await request.post("/api/mobile/goals", { headers: headersA, data: goalBody });
    expect(res.status()).toBe(201);
    const goalId = (await json(res)).id as string;
    res = await request.post("/api/mobile/goals", { headers: headersA, data: goalBody });
    expect((await json(res)).id).toBe(goalId);

    const add = { kind: "add", amount: "200", occurredAt: today, note: null, requestId: crypto.randomUUID() };
    for (let i = 0; i < 3; i++) {
      expect((await request.post(`/api/mobile/goals/${goalId}/contributions`, { headers: headersA, data: add })).status()).toBe(201);
    }
    await request.post(`/api/mobile/goals/${goalId}/contributions`, {
      headers: headersA,
      data: { kind: "withdraw", amount: "50", occurredAt: today, note: "oops", requestId: crypto.randomUUID() },
    });
    let body = await json(await request.get("/api/mobile/goals", { headers: headersA }));
    expect(body.goals).toHaveLength(1);
    expect(body.goals[0]).toMatchObject({ id: goalId, target: 50_000, saved: 15_000, remaining: 35_000, pct: 30, complete: false });
    expect(body.summary).toEqual({ totalTarget: 50_000, totalSaved: 15_000, activeCount: 1, completeCount: 0 });

    // B: sees none of it and changes none of it.
    expect((await json(await request.get("/api/mobile/goals", { headers: headersB }))).goals).toEqual([]);
    expect((await request.patch(`/api/mobile/goals/${goalId}`, { headers: headersB, data: { archived: true } })).status()).toBe(404);
    expect(
      (await request.post(`/api/mobile/goals/${goalId}/contributions`, { headers: headersB, data: { kind: "add", amount: "1", occurredAt: today } })).status(),
    ).toBe(404);
    expect((await json(await request.get("/api/mobile/goals", { headers: headersA }))).summary.totalSaved).toBe(15_000);
    expect((await json(await request.get("/api/mobile/hub", { headers: headersA }))).goals).toBe(1);
    expect((await json(await request.get("/api/mobile/hub", { headers: headersB }))).goals).toBe(0);

    // Archive, then it leaves the list and Home's savings card.
    expect((await request.patch(`/api/mobile/goals/${goalId}`, { headers: headersA, data: { archived: true } })).status()).toBe(200);
    expect((await json(await request.get("/api/mobile/goals", { headers: headersA }))).goals).toEqual([]);
    expect((await json(await request.get("/api/mobile/home", { headers: headersA }))).savings).toBeNull();

    // ── money on the insights / budgets / home screens ─────────────────────────────────────────────────────
    const cats = (await json(await request.get("/api/mobile/categories", { headers: headersA }))).categories as Body[];
    const food = cats.find((c) => c.name === "Food / Groceries")!;
    const salary = cats.find((c) => c.name === "Salary")!;
    const accountId = ((await json(await request.get("/api/mobile/accounts", { headers: headersA }))).accounts as Body[]).find((x) => x.selectable)!.id;
    const txn = (over: Body) => ({ accountId, note: "", isTransfer: false, occurredAt: today, requestId: crypto.randomUUID(), ...over });
    for (const t of [
      txn({ categoryId: salary.id, amount: "1000", direction: "credit", description: "E2E pay" }),
      txn({ categoryId: food.id, amount: "120", direction: "debit", description: "E2E food" }),
      txn({ categoryId: food.id, amount: "20", direction: "credit", description: "E2E refund" }),
      txn({ categoryId: null, amount: "300", direction: "debit", description: "E2E transfer", isTransfer: true }),
    ]) {
      expect((await request.post("/api/mobile/transactions", { headers: headersA, data: t })).status()).toBe(201);
    }
    const insights = await json(await request.get("/api/mobile/insights", { headers: headersA }));
    expect(insights).toMatchObject({ month: thisMonth, income: 100_000, spent: 10_000, moneyLeft: 90_000, savingsRate: 0.9 });
    expect(insights.incomeSources).toEqual([expect.objectContaining({ name: "Salary", amount: 100_000, share: 100 })]);
    expect(insights.breakdown).toEqual([{ name: "Food / Groceries", amount: 10_000, share: 100 }]);
    expect(insights.suggestion).toMatchObject({ kind: "unbudgeted", name: "Food / Groceries", share: 100 });
    const home = await json(await request.get("/api/mobile/home", { headers: headersA }));
    expect(home).toMatchObject({ moneyLeft: 90_000, spent: 10_000 });
    expect(home.breakdown).toEqual(insights.breakdown);
    expect(home.suggestion).toEqual(insights.suggestion);
    const budgets = await json(await request.get("/api/mobile/budgets", { headers: headersA }));
    expect(budgets).toMatchObject({ range: "month", spent: 10_000, budgeted: 0 });
    expect(budgets.unbudgetedCategories.map((c: Body) => c.id)).toContain(food.id);
    const allTime = await json(await request.get("/api/mobile/budgets?range=all", { headers: headersA }));
    expect(allTime.allTime).toEqual([expect.objectContaining({ categoryId: food.id, total: 10_000 })]);
    const bInsights = await json(await request.get("/api/mobile/insights", { headers: headersB }));
    expect(bInsights).toMatchObject({ income: 0, spent: 0, moneyLeft: 0, savingsRate: null });

    // ── categories: create once, rename, archive; B can't touch it ──────────────────────────────────────────
    const catReq = crypto.randomUUID();
    const catBody = { name: "E2E pets", kind: "expense", color: "#22c55e", requestId: catReq };
    res = await request.post("/api/mobile/categories", { headers: headersA, data: catBody });
    expect(res.status()).toBe(201);
    const catId = (await json(res)).id as string;
    expect((await json(await request.post("/api/mobile/categories", { headers: headersA, data: catBody }))).id).toBe(catId);
    expect((await request.patch(`/api/mobile/categories/${catId}`, { headers: headersB, data: { archived: true } })).status()).toBe(404);
    expect(
      (await request.patch(`/api/mobile/categories/${catId}`, { headers: headersA, data: { name: "E2E pet care", kind: "expense", color: "#3b82f6" } })).status(),
    ).toBe(200);
    expect((await request.patch(`/api/mobile/categories/${catId}`, { headers: headersA, data: { archived: true } })).status()).toBe(200);
    body = await json(await request.get("/api/mobile/settings/categories", { headers: headersA }));
    expect(body.categories.filter((c: Body) => c.name.startsWith("E2E"))).toEqual([
      { id: catId, name: "E2E pet care", kind: "expense", color: "#3b82f6", archived: true, txnCount: 0 },
    ]);
    expect(body.categories.find((c: Body) => c.id === food.id).txnCount).toBe(2);
    expect(JSON.stringify(await json(await request.get("/api/mobile/settings/categories", { headers: headersB })))).not.toContain("E2E");

    // ── export, accounts overview, status, activity ─────────────────────────────────────────────────────────
    res = await request.get("/api/mobile/export/transactions", { headers: headersA });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const csv = await res.text();
    expect(csv.trim().split("\r\n")).toHaveLength(1 + 4);
    expect(csv).toContain("E2E food");
    expect(await (await request.get("/api/mobile/export/transactions", { headers: headersB })).text()).not.toContain("E2E");

    const overview = await json(await request.get("/api/mobile/accounts/overview", { headers: headersA }));
    const mine = overview.groups.flatMap((g: Body) => g.accounts).find((x: Body) => x.id === accountId);
    expect(mine.txnCount).toBe(4);
    expect(JSON.stringify(await json(await request.get("/api/mobile/accounts/overview", { headers: headersB })))).not.toContain(accountId);

    const deleteScreen = await json(await request.get("/api/mobile/account/delete", { headers: headersA }));
    expect(deleteScreen).toMatchObject({ email: a.email, recent: true, inProgress: false });

    const status = await json(await request.get("/api/mobile/status", { headers: headersA }));
    expect(status).toMatchObject({ deletionInProgress: false, review: { advisory: null, excluded: null } });
    expect((await request.get("/api/mobile/activity", { headers: headersA })).status()).toBe(200);

    // A manual row is not a bank row: categorize answers not_found (only imported rows are categorized there), and B's
    // attempt on A's row is equally a 404.
    const manual = ((await json(await request.get("/api/mobile/transactions", { headers: headersA }))).items as Body[])[0]!;
    for (const headers of [headersA, headersB]) {
      const r = await request.post(`/api/mobile/transactions/${manual.id}/categorize`, { headers, data: { categoryId: food.id } });
      expect([404]).toContain(r.status());
    }
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

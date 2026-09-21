/**
 * Live contract test for the native data API (`/api/mobile/*`, docs/specs/2026-09-21-mobile-only-transition-design.md §4A/§8)
 * against a real deployed server: real HTTPS, a real Supabase-issued Bearer token, real PostgREST + RLS. Unit tests fake the
 * database, so this is what proves the read models' filters, the keyset cursor, idempotent creates, the currency-set-once rule
 * and — most importantly — that one user can never see or change another's data.
 *
 * Uses Playwright's `request` fixture (no browser). Point it at STAGING only (`PLAYWRIGHT_BASE_URL`); it creates and deletes
 * its own throwaway users.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, mintAccessToken } from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const thisMonth = new Date().toISOString().slice(0, 7);
const nextMonth = (() => {
  const [y, m] = thisMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
})();

async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return (await res.json()) as Record<string, any>;
}

test("no /api/mobile data route answers without a Bearer token", async ({ request }) => {
  for (const path of ["/profile", "/accounts", "/categories", "/transactions", "/budgets"]) {
    expect((await request.get(`/api/mobile${path}`)).status(), path).toBe(401);
  }
  expect((await request.post("/api/mobile/onboarding", { data: { currency: "USD" } })).status()).toBe(401);
});

test("native data API end to end, with cross-user isolation", async ({ request }) => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const tokenA = await mintAccessToken(a.email);
    const tokenB = await mintAccessToken(b.email);
    const headersA = auth(tokenA);
    const headersB = auth(tokenB);

    // ── profile + onboarding: the currency is chosen once ────────────────────────────────────────────────────
    let res = await request.get("/api/mobile/profile", { headers: headersA });
    expect(res.status()).toBe(200);
    let body = await json(res);
    expect(body).toMatchObject({ email: a.email, onboarded: false });
    expect(body.supportedCurrencies).toContain("USD");

    res = await request.post("/api/mobile/onboarding", { headers: headersA, data: { currency: "EUR" } });
    expect(res.status()).toBe(200);
    expect(await json(res)).toEqual({ onboarded: true, currency: "EUR" });

    res = await request.post("/api/mobile/onboarding", { headers: headersA, data: { currency: "GBP" } });
    expect(res.status()).toBe(409);
    expect((await json(res)).error).toBe("already_onboarded");
    body = await json(await request.get("/api/mobile/profile", { headers: headersA }));
    expect(body).toMatchObject({ onboarded: true, currency: "EUR" }); // the second attempt changed nothing

    res = await request.post("/api/mobile/onboarding", { headers: headersB, data: { currency: "JPY" } });
    expect(res.status()).toBe(422); // not a supported currency

    // ── categories (seeded by the signup trigger) ───────────────────────────────────────────────────────────
    body = await json(await request.get("/api/mobile/categories", { headers: headersA }));
    const expense = (body.categories as { id: string; kind: string }[]).filter((c) => c.kind === "expense");
    expect(expense.length).toBeGreaterThan(1);
    const [catOne, catTwo] = expense;

    // ── accounts ─────────────────────────────────────────────────────────────────────────────────────────────
    res = await request.post("/api/mobile/accounts", { headers: headersA, data: { name: "Wallet", type: "cash" } });
    expect(res.status()).toBe(201);
    const accountId = (await json(res)).id as string;

    res = await request.post("/api/mobile/accounts", { headers: headersA, data: { name: "", type: "cash" } });
    expect(res.status()).toBe(422);

    body = await json(await request.get("/api/mobile/accounts", { headers: headersA }));
    expect(body.accounts.find((x: any) => x.id === accountId)).toMatchObject({ name: "Wallet", source: "manual", selectable: true, archived: false });

    expect((await request.patch(`/api/mobile/accounts/${accountId}`, { headers: headersA, data: { name: "Cash", type: "cash" } })).status()).toBe(200);
    expect((await request.patch(`/api/mobile/accounts/${accountId}`, { headers: headersA, data: { archived: true } })).status()).toBe(200);
    body = await json(await request.get("/api/mobile/accounts", { headers: headersA }));
    expect(body.accounts.find((x: any) => x.id === accountId)).toMatchObject({ name: "Cash", archived: true, selectable: false });
    await request.patch(`/api/mobile/accounts/${accountId}`, { headers: headersA, data: { archived: false } });

    // ── transactions: create (idempotent), page, filter, edit, delete ───────────────────────────────────────
    const txn = (day: string, over: Record<string, unknown> = {}) => ({
      accountId,
      categoryId: catOne.id,
      amount: "12.34",
      direction: "debit",
      occurredAt: `${thisMonth}-${day}`,
      description: `Coffee ${day}`,
      note: "",
      isTransfer: false,
      ...over,
    });

    res = await request.post("/api/mobile/transactions", { headers: headersA, data: { ...txn("05"), requestId: "req-aaaa-0005" } });
    expect(res.status()).toBe(201);
    const first = (await json(res)).id as string;

    // A retried create (same requestId) must not insert a second row.
    res = await request.post("/api/mobile/transactions", { headers: headersA, data: { ...txn("05"), requestId: "req-aaaa-0005" } });
    expect(res.status()).toBe(201);
    expect((await json(res)).id).toBe(first);

    await request.post("/api/mobile/transactions", { headers: headersA, data: { ...txn("10", { description: "Groceries 50%_off" }), requestId: "req-aaaa-0010" } });
    res = await request.post("/api/mobile/transactions", { headers: headersA, data: { ...txn("15", { categoryId: null }), requestId: "req-aaaa-0015" } });
    expect(res.status()).toBe(201);

    res = await request.post("/api/mobile/transactions", { headers: headersA, data: txn("11", { amount: "abc" }) });
    expect(res.status()).toBe(422);
    expect((await json(res)).fieldErrors.amount).toBeTruthy();

    // Paging: newest first, no overlap, three rows in total.
    res = await request.get(`/api/mobile/transactions?month=${thisMonth}&limit=2`, { headers: headersA });
    expect(res.status()).toBe(200);
    body = await json(res);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].description).toBe("Coffee 15");
    expect(body.items[0]).toMatchObject({ uncategorized: true, category: null, account: { id: accountId, name: "Cash" } });
    expect(typeof body.nextCursor).toBe("string");
    const page2 = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}&limit=2&cursor=${encodeURIComponent(body.nextCursor)}`, { headers: headersA }));
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const ids = [...body.items, ...page2.items].map((t: any) => t.id);
    expect(new Set(ids).size).toBe(3);

    // Filters.
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}&category=${catOne.id}`, { headers: headersA }));
    expect(body.items).toHaveLength(2);
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}&search=${encodeURIComponent("50%_off")}`, { headers: headersA }));
    expect(body.items.map((t: any) => t.description)).toEqual(["Groceries 50%_off"]); // LIKE metacharacters are literal
    expect((await request.get(`/api/mobile/transactions?month=${thisMonth}&cursor=garbage`, { headers: headersA })).status()).toBe(422);

    // Edit and delete.
    res = await request.patch(`/api/mobile/transactions/${first}`, { headers: headersA, data: txn("05", { categoryId: catTwo.id, amount: "20.00" }) });
    expect(res.status()).toBe(200);
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}&category=${catTwo.id}`, { headers: headersA }));
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: first, amount: 2000 });

    // ── budgets ──────────────────────────────────────────────────────────────────────────────────────────────
    res = await request.put("/api/mobile/budgets", { headers: headersA, data: { categoryId: catOne.id, month: thisMonth, amount: "400" } });
    expect(res.status()).toBe(200);
    body = await json(await request.get(`/api/mobile/budgets?month=${thisMonth}`, { headers: headersA }));
    expect(body).toMatchObject({ version: 1, month: thisMonth, currency: "EUR" });
    expect(body.categories.find((c: any) => c.id === catOne.id)).toMatchObject({ budget: 40000 });

    res = await request.post("/api/mobile/budgets/copy", { headers: headersA, data: { month: nextMonth } });
    expect(res.status()).toBe(200);
    body = await json(await request.get(`/api/mobile/budgets?month=${nextMonth}`, { headers: headersA }));
    expect(body.categories.find((c: any) => c.id === catOne.id)).toMatchObject({ budget: 40000 });

    expect((await request.put("/api/mobile/budgets", { headers: headersA, data: { categoryId: catOne.id, month: thisMonth, amount: "" } })).status()).toBe(200);
    body = await json(await request.get(`/api/mobile/budgets?month=${thisMonth}`, { headers: headersA }));
    expect(body.categories.find((c: any) => c.id === catOne.id).budget).toBe(0);

    // Nothing to copy from an empty month.
    res = await request.post("/api/mobile/budgets/copy", { headers: headersA, data: { month: "2001-02" } });
    expect(res.status()).toBe(409);

    // ── isolation: user B can neither see nor touch user A's data ────────────────────────────────────────────
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}`, { headers: headersB }));
    expect(body.items).toHaveLength(0);
    body = await json(await request.get("/api/mobile/accounts", { headers: headersB }));
    expect(body.accounts.find((x: any) => x.id === accountId)).toBeUndefined();

    expect((await request.patch(`/api/mobile/transactions/${first}`, { headers: headersB, data: txn("05") })).status()).toBe(404);
    expect((await request.delete(`/api/mobile/transactions/${first}`, { headers: headersB })).status()).toBe(404);
    expect((await request.patch(`/api/mobile/accounts/${accountId}`, { headers: headersB, data: { archived: true } })).status()).toBe(404);
    // ...and the attempts changed nothing for A.
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}&category=${catTwo.id}`, { headers: headersA }));
    expect(body.items).toHaveLength(1);

    // ── delete ────────────────────────────────────────────────────────────────────────────────────────────────
    expect((await request.delete(`/api/mobile/transactions/${first}`, { headers: headersA })).status()).toBe(200);
    expect((await request.delete(`/api/mobile/transactions/${first}`, { headers: headersA })).status()).toBe(404);
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}`, { headers: headersA }));
    expect(body.items).toHaveLength(2);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

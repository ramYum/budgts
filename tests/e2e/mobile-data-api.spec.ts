/**
 * Live contract test for the native data API (`/api/mobile/*`, docs/specs/2026-09-17-mobile-app-launch-design.md §6)
 * against a real deployed server: real HTTPS, a real Supabase-issued Bearer token, real PostgREST + RLS. Unit tests fake the
 * database, so this is what proves the read models' filters, the keyset cursor, idempotent creates, the currency-set-once rule
 * and — most importantly — that one user can never see or change another's data.
 *
 * Uses Playwright's `request` fixture (no browser). Point it at STAGING only (`PLAYWRIGHT_BASE_URL`); it creates and deletes
 * its own throwaway users.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { formatMoney } from "../../src/lib/display/money";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
  mintAccessToken,
} from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY");

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
// The users below live in UTC, so their month is the UTC month; the server still decides it (asserted via /home).
const ZONE = "UTC";
const thisMonth = new Date().toISOString().slice(0, 7);
const nextMonth = (() => {
  const [y, m] = thisMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
})();

type Account = { id: string; name: string; source: string; archived: boolean; selectable: boolean };
/** `/categories` rows carry `kind`; `/budgets` rows carry `budget`. */
type Category = { id: string; kind: string; budget: number };
type Txn = { id: string; description: string; amount: number; source: string };
/** The union of every field this test reads from the native API's JSON bodies (asserted where it matters). */
type Body = {
  error: string;
  id: string;
  month: string;
  timeZone: string;
  moneyLeft: number;
  income: number;
  spent: number;
  email: string;
  onboarded: boolean;
  currency: string;
  supportedCurrencies: string[];
  fieldErrors: Record<string, string>;
  categories: Category[];
  accounts: Account[];
  items: Txn[];
  nextCursor: string;
};

async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<Body> {
  return (await res.json()) as Body;
}

test("no /api/mobile data route answers without a Bearer token", async ({ request }) => {
  for (const path of ["/profile", "/accounts", "/categories", "/transactions", "/budgets"]) {
    expect((await request.get(`/api/mobile${path}`)).status(), path).toBe(401);
  }
  for (const path of ["/home", "/session"]) {
    expect((await request.get(`/api/mobile${path}`)).status(), path).toBe(401);
  }
  expect((await request.post("/api/mobile/onboarding", { data: { currency: "USD", time_zone: ZONE } })).status()).toBe(401);
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

    // Data routes need a finished onboarding (they read the user's time zone).
    expect((await request.get("/api/mobile/home", { headers: headersA })).status()).toBe(409);

    res = await request.post("/api/mobile/onboarding", { headers: headersA, data: { currency: "EUR" } });
    expect(res.status()).toBe(422); // the device's time zone is required
    expect((await json(res)).error).toBe("invalid_time_zone");

    res = await request.post("/api/mobile/onboarding", { headers: headersA, data: { currency: "EUR", time_zone: ZONE } });
    expect(res.status()).toBe(200);
    expect(await json(res)).toEqual({ onboarded: true, currency: "EUR", timeZone: ZONE });
    expect((await json(await request.get("/api/mobile/home", { headers: headersA }))).month).toBe(thisMonth);

    res = await request.post("/api/mobile/onboarding", { headers: headersA, data: { currency: "GBP", time_zone: ZONE } });
    expect(res.status()).toBe(409);
    expect((await json(res)).error).toBe("already_onboarded");
    body = await json(await request.get("/api/mobile/profile", { headers: headersA }));
    expect(body).toMatchObject({ onboarded: true, currency: "EUR" }); // the second attempt changed nothing

    res = await request.post("/api/mobile/onboarding", { headers: headersB, data: { currency: "JPY", time_zone: ZONE } });
    expect(res.status()).toBe(422); // not a supported currency
    res = await request.post("/api/mobile/onboarding", { headers: headersB, data: { currency: "USD", time_zone: ZONE } });
    expect(res.status()).toBe(200);

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
    expect(body.accounts.find((x) => x.id === accountId)).toMatchObject({ name: "Wallet", source: "manual", selectable: true, archived: false });

    expect((await request.patch(`/api/mobile/accounts/${accountId}`, { headers: headersA, data: { name: "Cash", type: "cash" } })).status()).toBe(200);
    expect((await request.patch(`/api/mobile/accounts/${accountId}`, { headers: headersA, data: { archived: true } })).status()).toBe(200);
    body = await json(await request.get("/api/mobile/accounts", { headers: headersA }));
    expect(body.accounts.find((x) => x.id === accountId)).toMatchObject({ name: "Cash", archived: true, selectable: false });
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
    const ids = [...body.items, ...page2.items].map((t) => t.id);
    expect(new Set(ids).size).toBe(3);

    // Filters.
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}&category=${catOne.id}`, { headers: headersA }));
    expect(body.items).toHaveLength(2);
    // No server text search: the app filters every row of the month itself, as the web does; a stray param changes nothing.
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}&search=${encodeURIComponent("50%_off")}`, { headers: headersA }));
    expect(body.items).toHaveLength(3);
    expect(body.items.every((t) => t.source === "manual")).toBe(true);
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
    expect(body.categories.find((c) => c.id === catOne.id)).toMatchObject({ budget: 40000 });

    res = await request.post("/api/mobile/budgets/copy", { headers: headersA, data: { month: nextMonth } });
    expect(res.status()).toBe(200);
    body = await json(await request.get(`/api/mobile/budgets?month=${nextMonth}`, { headers: headersA }));
    expect(body.categories.find((c) => c.id === catOne.id)).toMatchObject({ budget: 40000 });

    expect((await request.put("/api/mobile/budgets", { headers: headersA, data: { categoryId: catOne.id, month: thisMonth, amount: "" } })).status()).toBe(200);
    body = await json(await request.get(`/api/mobile/budgets?month=${thisMonth}`, { headers: headersA }));
    expect(body.categories.find((c) => c.id === catOne.id)?.budget).toBe(0);

    // Nothing to copy from an empty month.
    res = await request.post("/api/mobile/budgets/copy", { headers: headersA, data: { month: "2001-02" } });
    expect(res.status()).toBe(409);

    // ── isolation: user B can neither see nor touch user A's data ────────────────────────────────────────────
    body = await json(await request.get(`/api/mobile/transactions?month=${thisMonth}`, { headers: headersB }));
    expect(body.items).toHaveLength(0);
    body = await json(await request.get("/api/mobile/accounts", { headers: headersB }));
    expect(body.accounts.find((x) => x.id === accountId)).toBeUndefined();

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

test("the native Home numbers are the web Home's numbers", async ({ request, page }) => {
  const user = await createTestUser();
  try {
    const headers = auth(await mintAccessToken(user.email));
    expect(
      (await request.post("/api/mobile/onboarding", { headers, data: { currency: "USD", time_zone: "America/Chicago" } })).status(),
    ).toBe(200);

    const categories = (await json(await request.get("/api/mobile/categories", { headers }))).categories as {
      id: string;
      kind: string;
      name?: string;
    }[];
    const income = categories.find((c) => c.kind === "income")!;
    const expense = categories.find((c) => c.kind === "expense")!;
    const accounts = (await json(await request.get("/api/mobile/accounts", { headers }))).accounts;
    const accountId = accounts.find((a) => a.selectable)!.id;
    const home0 = await json(await request.get("/api/mobile/home", { headers }));
    const day = `${home0.month}-02`;
    const add = (over: Record<string, unknown>) =>
      request.post("/api/mobile/transactions", {
        headers,
        data: { accountId, amount: "0", direction: "debit", occurredAt: day, description: "x", note: "", isTransfer: false, ...over },
      });
    expect((await add({ categoryId: income.id, amount: "2500.00", direction: "credit", description: "Paycheck" })).status()).toBe(201);
    expect((await add({ categoryId: expense.id, amount: "312.47", description: "Spend" })).status()).toBe(201);
    expect((await add({ categoryId: expense.id, amount: "12.47", direction: "credit", description: "Refund" })).status()).toBe(201);
    expect((await add({ categoryId: null, amount: "900.00", description: "To savings", isTransfer: true })).status()).toBe(201);

    const home = await json(await request.get("/api/mobile/home", { headers }));
    expect(home.income).toBe(250000);
    expect(home.spent).toBe(30000); // the refund nets against its category; the transfer is not spending
    expect(home.moneyLeft).toBe(220000);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/auth/callback?token_hash=${await magicTokenHash(user.email)}&type=magiclink&next=/`);
    await page.waitForURL((u) => u.pathname === "/" || u.pathname === "/tour", { timeout: 20000 });
    if (new URL(page.url()).pathname === "/tour") {
      await page.getByRole("button", { name: "Skip" }).click();
      await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
    }
    const hero = page.locator("section[aria-labelledby=home-money-left]");
    await expect(hero).toContainText(formatMoney(home.moneyLeft, "USD", "en-US"));
    await expect(hero).toContainText(formatMoney(home.income, "USD", "en-US"));
    await expect(hero).toContainText(formatMoney(home.spent, "USD", "en-US"));
  } finally {
    await deleteTestUser(user.id);
  }
});

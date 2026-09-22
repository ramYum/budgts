/**
 * Live contract test for the native Plaid bank-connect chain (`/api/plaid/{link-token,exchange,item}` in dual-auth
 * mode, `/api/mobile/plaid/*`) against a real deployed server: real HTTPS, a real Supabase-issued Bearer token, real
 * Plaid Sandbox. Uses `/api/plaid/test/seed` to mint a Sandbox public_token — Plaid Link's own UI is not scriptable
 * and, on native, requires a device the CI/dev environment doesn't have — so this exercises every Budgts step around
 * it for real: native-parameterized link-token creation, exchange, account mapping, sync, the connected-banks list,
 * the exclusion toggle and disconnect, over Bearer, with cross-user isolation.
 *
 * What this does NOT verify: opening Plaid Link itself on a device, or the OAuth Universal Link handoff — those need
 * a real iOS/Android build (mobile-only-transition spec §4B/§8).
 *
 * Point at STAGING only (`PLAYWRIGHT_BASE_URL`); skipped without admin credentials, mirroring `tests/e2e/plaid.spec.ts`.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createTestUser, deleteTestUser, hasAdminCredentials, mintAccessToken } from "./helpers/test-user";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "";
const targetsStaging = /staging/i.test(baseURL);

test.skip(
  !hasAdminCredentials() || !targetsStaging,
  "needs Supabase admin credentials for STAGING and PLAYWRIGHT_BASE_URL pointing at the staging deploy — never run against production.",
);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type SeedAccount = { plaidAccountId: string; name: string | null };
type BankAccountRow = { rowId: string; plaidAccountId: string; linkState: string; mappedAccountName: string | null };
type Bank = { id: string; itemId: string; accounts: BankAccountRow[]; unmappedAccounts: SeedAccount[] };
type Body = {
  error: string;
  link_token: string;
  public_token: string;
  institution: { institution_id: string; name: string };
  plaidItemId: string;
  itemId: string;
  accounts: SeedAccount[];
  banks: Bank[];
  ok: boolean;
};

async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<Body> {
  return (await res.json()) as Body;
}

test("no /api/mobile/plaid route answers without a Bearer token", async ({ request }) => {
  expect((await request.get("/api/mobile/plaid/banks")).status()).toBe(401);
  expect((await request.post("/api/mobile/plaid/accounts/map", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/mobile/plaid/sync", { data: {} })).status()).toBe(401);
  expect((await request.patch("/api/mobile/plaid/accounts/11111111-1111-4111-8111-111111111111/exclude", { data: {} })).status()).toBe(401);
});

test("native bank-connect end to end, with native Link params and cross-user isolation", async ({ request }) => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const tokenA = await mintAccessToken(a.email);
    const tokenB = await mintAccessToken(b.email);
    const headersA = auth(tokenA);
    const headersB = auth(tokenB);

    // ── link-token: Bearer-authenticated, and each platform's params are accepted without error ──────────────
    for (const platform of ["ios", "android", undefined]) {
      const res = await request.post("/api/plaid/link-token", { headers: headersA, data: platform ? { platform } : {} });
      expect(res.status(), platform ?? "web").toBe(200);
      const body = await json(res);
      expect(typeof body.link_token).toBe("string");
    }
    expect((await request.post("/api/plaid/link-token", { data: {} })).status()).toBe(401); // no auth at all

    // ── seed a Sandbox public_token and exchange it over Bearer ─────────────────────────────────────────────
    const seedRes = await request.post("/api/plaid/test/seed", { headers: headersA, data: {} });
    test.skip(seedRes.status() === 404, "PLAID_TEST_SEED_ENABLED is not on for this deployment");
    expect(seedRes.status()).toBe(200);
    const seed = await json(seedRes);

    const exchangeRes = await request.post("/api/plaid/exchange", {
      headers: headersA,
      data: { public_token: seed.public_token, institution: seed.institution },
    });
    expect(exchangeRes.status()).toBe(200);
    const exchanged = await json(exchangeRes);
    const plaidItemId = exchanged.plaidItemId as string;
    expect(Array.isArray(exchanged.accounts)).toBe(true);
    expect(exchanged.accounts.length).toBeGreaterThan(0);
    const firstAccount = exchanged.accounts[0].plaidAccountId as string;

    // ── connected-banks list shows it, unmapped ─────────────────────────────────────────────────────────────
    let banks = await json(await request.get("/api/mobile/plaid/banks", { headers: headersA }));
    let bank = banks.banks.find((x) => x.id === plaidItemId);
    expect(bank).toBeTruthy();
    expect(bank!.unmappedAccounts.length).toBe(exchanged.accounts.length);

    // ── account mapping: the first account becomes a new Budgts account, the rest are skipped ──────────────
    const entries = exchanged.accounts.map((acc, i) =>
      i === 0
        ? { plaidAccountId: acc.plaidAccountId, mode: "new", name: "Sandbox Checking", type: "checking" }
        : { plaidAccountId: acc.plaidAccountId, mode: "ignore" },
    );
    const mapRes = await request.post("/api/mobile/plaid/accounts/map", { headers: headersA, data: { plaidItemId, entries } });
    expect(mapRes.status()).toBe(200);
    expect((await json(mapRes)).ok).toBe(true);

    banks = await json(await request.get("/api/mobile/plaid/banks", { headers: headersA }));
    bank = banks.banks.find((x) => x.id === plaidItemId);
    expect(bank!.unmappedAccounts).toHaveLength(0);
    const mappedRow = bank!.accounts.find((x) => x.plaidAccountId === firstAccount)!;
    expect(mappedRow).toMatchObject({ linkState: "mapped", mappedAccountName: "Sandbox Checking" });

    // ── sync now ─────────────────────────────────────────────────────────────────────────────────────────────
    const syncRes = await request.post("/api/mobile/plaid/sync", { headers: headersA, data: { itemId: bank!.itemId } });
    expect(syncRes.status()).toBe(200);
    expect((await json(syncRes)).ok).toBe(true);

    // ── exclusion toggle: a fresh sandbox account doesn't need review, so excluding it is refused, not silently
    //    applied — and re-including (false) has no such requirement ──────────────────────────────────────────
    const excludeRes = await request.patch(`/api/mobile/plaid/accounts/${mappedRow.rowId}/exclude`, { headers: headersA, data: { excluded: true } });
    expect(excludeRes.status()).toBe(409);
    expect((await json(excludeRes)).error).toBe("needs_review_required");
    const reincludeRes = await request.patch(`/api/mobile/plaid/accounts/${mappedRow.rowId}/exclude`, { headers: headersA, data: { excluded: false } });
    expect(reincludeRes.status()).toBe(200);

    // ── isolation: user B can neither see nor act on user A's connection ──────────────────────────────────────
    const banksB = await json(await request.get("/api/mobile/plaid/banks", { headers: headersB }));
    expect(banksB.banks.find((x) => x.id === plaidItemId)).toBeUndefined();
    expect((await request.post("/api/mobile/plaid/sync", { headers: headersB, data: { itemId: bank!.itemId } })).status()).toBe(404);
    expect((await request.patch(`/api/mobile/plaid/accounts/${mappedRow.rowId}/exclude`, { headers: headersB, data: { excluded: false } })).status()).toBe(404);
    expect(
      (await request.post("/api/mobile/plaid/accounts/map", { headers: headersB, data: { plaidItemId, entries: [{ plaidAccountId: firstAccount, mode: "ignore" }] } })).status(),
    ).toBe(404);
    expect((await request.delete("/api/plaid/item", { headers: headersB, data: { itemId: bank!.itemId } })).status()).toBe(404);

    // ── disconnect over Bearer (dual-auth item route) ──────────────────────────────────────────────────────
    const disconnectRes = await request.delete("/api/plaid/item", { headers: headersA, data: { itemId: bank!.itemId } });
    expect(disconnectRes.status()).toBe(200);
    expect((await json(disconnectRes)).ok).toBe(true);

    banks = await json(await request.get("/api/mobile/plaid/banks", { headers: headersA }));
    expect(banks.banks.find((x) => x.id === plaidItemId)).toBeUndefined();
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

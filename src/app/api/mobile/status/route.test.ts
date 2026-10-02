import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getBearerContext = vi.fn();
const loadMobileStatus = vi.fn();
const loadMobileActivityExtras = vi.fn();
const categorize = vi.fn();
const rescan = vi.fn();
const clearReview = vi.fn();
const loadAccountsOverview = vi.fn();
const profileTimeZone = vi.fn();
let plaidOn = true;
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => plaidOn }));
vi.mock("@/lib/mobile/status", () => ({
  loadMobileStatus: (...a: unknown[]) => loadMobileStatus(...a),
  loadMobileActivityExtras: (...a: unknown[]) => loadMobileActivityExtras(...a),
}));
vi.mock("@/server/plaid/commands", () => ({
  categorizeBankTransactionFor: (...a: unknown[]) => categorize(...a),
  rescanUncategorizedFor: (...a: unknown[]) => rescan(...a),
  clearAccountReviewFor: (...a: unknown[]) => clearReview(...a),
}));
vi.mock("@/lib/accounts/load-accounts-overview", () => ({
  loadAccountsOverview: (...a: unknown[]) => loadAccountsOverview(...a),
}));
vi.mock("@/lib/mobile/time-zone", () => ({ profileTimeZone: (...a: unknown[]) => profileTimeZone(...a) }));

import { GET as STATUS } from "./route";
import { GET as ACTIVITY } from "../activity/route";
import { POST as CATEGORIZE } from "../transactions/[id]/categorize/route";
import { POST as RESCAN } from "../transactions/rescan/route";
import { DELETE as CLEAR_REVIEW } from "../plaid/accounts/[rowId]/review/route";
import { GET as OVERVIEW } from "../accounts/overview/route";

const TXN = "55555555-5555-4555-8555-555555555555";
const CAT = "66666666-6666-4666-8666-666666666666";
const supabase = { __as: "user-a" };
const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = <K extends string>(key: K, value: string) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });

beforeEach(() => {
  for (const m of [getBearerContext, loadMobileStatus, loadMobileActivityExtras, categorize, rescan, clearReview, loadAccountsOverview, profileTimeZone]) {
    m.mockReset();
  }
  plaidOn = true;
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  profileTimeZone.mockResolvedValue("UTC");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/status and /api/mobile/activity", () => {
  it("serve the shared loaders for the verified user", async () => {
    loadMobileStatus.mockResolvedValue({ version: 1, needsCategoryCount: 2, review: { advisory: null, excluded: null }, deletionInProgress: false });
    expect(await (await STATUS(req("/api/mobile/status?userId=victim"))).json()).toMatchObject({ needsCategoryCount: 2 });
    expect(loadMobileStatus).toHaveBeenCalledWith(supabase, "user-a", true);

    loadMobileActivityExtras.mockResolvedValue({ version: 1, plaidEnabled: true, needsCategory: [], missingStandardCategories: [], limitedHistory: [] });
    expect((await ACTIVITY(req("/api/mobile/activity"))).status).toBe(200);
    expect(loadMobileActivityExtras).toHaveBeenCalledWith(supabase, "user-a", true);
  });

  it("a failed read is a generic 503; no token is a 401", async () => {
    loadMobileActivityExtras.mockRejectedValue(new Error("needs_category_read_failed"));
    const res = await ACTIVITY(req("/api/mobile/activity"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    getBearerContext.mockResolvedValue(null);
    expect((await STATUS(req("/api/mobile/status"))).status).toBe(401);
  });
});

describe("POST /api/mobile/transactions/:id/categorize", () => {
  it("categorizes the row in the path for the verified user", async () => {
    categorize.mockResolvedValue({ ok: true });
    const res = await CATEGORIZE(req(`/api/mobile/transactions/${TXN}/categorize`, "POST", { categoryId: CAT, transactionId: "ignored" }), params("id", TXN));
    expect(await res.json()).toEqual({ ok: true });
    expect(categorize).toHaveBeenCalledWith(supabase, "user-a", { transactionId: TXN, categoryId: CAT, standardCategoryName: undefined });
  });

  it("maps outcomes to stable codes", async () => {
    categorize.mockResolvedValue({ ok: false, error: "not_found", message: "That transaction no longer exists." });
    expect((await CATEGORIZE(req(`/api/mobile/transactions/${TXN}/categorize`, "POST", { categoryId: CAT }), params("id", TXN))).status).toBe(404);
    categorize.mockResolvedValue({ ok: false, error: "invalid", message: "Pick a category and try again." });
    const bad = await CATEGORIZE(req(`/api/mobile/transactions/${TXN}/categorize`, "POST", {}), params("id", TXN));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "invalid", fieldErrors: { form: "Pick a category and try again." } });
    categorize.mockResolvedValue({ ok: false, error: "failed", message: "Could not save the category. Try again." });
    expect((await CATEGORIZE(req(`/api/mobile/transactions/${TXN}/categorize`, "POST", { categoryId: CAT }), params("id", TXN))).status).toBe(503);
    expect((await CATEGORIZE(req("/api/mobile/transactions/x/categorize", "POST", {}), params("id", "x"))).status).toBe(404);
  });

  it("does nothing while bank connections are switched off", async () => {
    plaidOn = false;
    expect((await CATEGORIZE(req(`/api/mobile/transactions/${TXN}/categorize`, "POST", { categoryId: CAT }), params("id", TXN))).status).toBe(404);
    expect((await RESCAN(req("/api/mobile/transactions/rescan", "POST"))).status).toBe(404);
    expect(categorize).not.toHaveBeenCalled();
    expect(rescan).not.toHaveBeenCalled();
  });
});

describe("POST /api/mobile/transactions/rescan", () => {
  it("runs for the token's user only, passing the 'nothing new' note through", async () => {
    rescan.mockResolvedValue({ ok: true, warning: "Nothing new to categorise." });
    const res = await RESCAN(req("/api/mobile/transactions/rescan?userId=victim", "POST"));
    expect(await res.json()).toEqual({ ok: true, warning: "Nothing new to categorise." });
    expect(rescan).toHaveBeenCalledWith("user-a");
  });
});

describe("DELETE /api/mobile/plaid/accounts/:rowId/review", () => {
  it("clears the flag through the caller's client; another user's row is 404", async () => {
    clearReview.mockResolvedValue({ ok: true });
    expect((await CLEAR_REVIEW(req(`/api/mobile/plaid/accounts/${TXN}/review`, "DELETE"), params("rowId", TXN))).status).toBe(200);
    expect(clearReview).toHaveBeenCalledWith(supabase, TXN);
    clearReview.mockResolvedValue({ ok: false, error: "not_found", message: "That account no longer exists." });
    expect((await CLEAR_REVIEW(req(`/api/mobile/plaid/accounts/${TXN}/review`, "DELETE"), params("rowId", TXN))).status).toBe(404);
  });
});

describe("GET /api/mobile/accounts/overview", () => {
  it("serves loadAccountsOverview in the user's own month", async () => {
    loadAccountsOverview.mockResolvedValue({ month: "2026-09", groups: [], archived: [] });
    expect(await (await OVERVIEW(req("/api/mobile/accounts/overview"))).json()).toEqual({
      version: 1,
      month: "2026-09",
      groups: [],
      archived: [],
    });
    expect(loadAccountsOverview).toHaveBeenCalledWith(supabase, { timeZone: "UTC", plaidEnabled: true });
    profileTimeZone.mockResolvedValue(null);
    expect((await OVERVIEW(req("/api/mobile/accounts/overview"))).status).toBe(409);
  });
});

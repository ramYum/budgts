import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadCategories = vi.fn();
const loadCategorySettings = vi.fn();
const profileTimeZone = vi.fn();
const createCategory = vi.fn();
const updateCategory = vi.fn();
const setCategoryArchived = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/mobile/reads", async (orig) => ({
  ...(await orig<typeof import("@/lib/mobile/reads")>()),
  loadCategories: (...a: unknown[]) => loadCategories(...a),
}));
vi.mock("@/lib/categories/load-category-settings", () => ({
  loadCategorySettings: (...a: unknown[]) => loadCategorySettings(...a),
}));
vi.mock("@/lib/mobile/time-zone", () => ({ profileTimeZone: (...a: unknown[]) => profileTimeZone(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => false }));
vi.mock("@/lib/categories/commands", () => ({
  createCategory: (...a: unknown[]) => createCategory(...a),
  updateCategory: (...a: unknown[]) => updateCategory(...a),
  setCategoryArchived: (...a: unknown[]) => setCategoryArchived(...a),
}));

import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
import { GET as SETTINGS } from "../settings/categories/route";

const CAT = "33333333-3333-4333-8333-333333333333";
const supabase = { __as: "user-a" };
const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const m of [getBearerContext, loadCategories, loadCategorySettings, profileTimeZone, createCategory, updateCategory, setCategoryArchived]) {
    m.mockReset();
  }
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  profileTimeZone.mockResolvedValue("UTC");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/categories (picker)", () => {
  it("lists the caller's active categories", async () => {
    loadCategories.mockResolvedValue([{ id: CAT, name: "Food", kind: "expense", color: "#000" }]);
    const res = await GET(req("/api/mobile/categories"));
    expect(await res.json()).toEqual({ version: 1, categories: [{ id: CAT, name: "Food", kind: "expense", color: "#000" }] });
    expect(loadCategories).toHaveBeenCalledWith(supabase);
  });

  it("401 without a token", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req("/api/mobile/categories"))).status).toBe(401);
  });
});

describe("POST /api/mobile/categories", () => {
  it("creates for the verified user and returns the new id", async () => {
    createCategory.mockResolvedValue({ ok: true, id: CAT, name: "Pets" });
    const res = await POST(req("/api/mobile/categories", "POST", { name: "Pets", kind: "expense", requestId: CAT }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: CAT, name: "Pets" });
    expect(createCategory).toHaveBeenCalledWith(supabase, "user-a", { name: "Pets", kind: "expense", requestId: CAT }, CAT);
  });

  it("422 on validation, 400 on a non-object body", async () => {
    createCategory.mockResolvedValue({ ok: false, error: "invalid", fieldErrors: { name: "Name is required" } });
    expect((await POST(req("/api/mobile/categories", "POST", { name: "" }))).status).toBe(422);
    expect((await POST(req("/api/mobile/categories", "POST", "text"))).status).toBe(400);
  });
});

describe("PATCH /api/mobile/categories/:id", () => {
  it("archives or edits; an invisible id is 404", async () => {
    setCategoryArchived.mockResolvedValue({ ok: true });
    expect((await PATCH(req(`/api/mobile/categories/${CAT}`, "PATCH", { archived: true }), params(CAT))).status).toBe(200);
    expect(setCategoryArchived).toHaveBeenCalledWith(supabase, CAT, true);
    updateCategory.mockResolvedValue({ ok: false, error: "missing" });
    const res = await PATCH(req(`/api/mobile/categories/${CAT}`, "PATCH", { name: "x", kind: "expense" }), params(CAT));
    expect(res.status).toBe(404);
    expect((await PATCH(req("/api/mobile/categories/nope", "PATCH", { archived: true }), params("nope"))).status).toBe(404);
  });
});

describe("GET /api/mobile/settings/categories", () => {
  it("projects loadCategorySettings for the user's own month", async () => {
    loadCategorySettings.mockResolvedValue({
      month: "2026-09",
      items: [{ id: CAT, name: "Old", kind: "expense", color: "#aaa", is_archived: true, txnCount: 3 }],
    });
    const res = await SETTINGS(req("/api/mobile/settings/categories"));
    expect(await res.json()).toEqual({
      version: 1,
      month: "2026-09",
      categories: [{ id: CAT, name: "Old", kind: "expense", color: "#aaa", archived: true, txnCount: 3 }],
    });
    expect(loadCategorySettings).toHaveBeenCalledWith(supabase, { timeZone: "UTC", plaidEnabled: false });
  });

  it("not_onboarded before a time zone exists; 503 when the read fails", async () => {
    profileTimeZone.mockResolvedValue(null);
    expect((await SETTINGS(req("/api/mobile/settings/categories"))).status).toBe(409);
    profileTimeZone.mockResolvedValue("UTC");
    loadCategorySettings.mockRejectedValue(new Error("x"));
    expect((await SETTINGS(req("/api/mobile/settings/categories"))).status).toBe(503);
  });
});

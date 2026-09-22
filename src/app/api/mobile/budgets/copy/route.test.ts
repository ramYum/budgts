import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const copyBudgetsFromPreviousMonth = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/budget/commands", () => ({
  copyBudgetsFromPreviousMonth: (...a: unknown[]) => copyBudgetsFromPreviousMonth(...a),
}));

import { POST } from "./route";

const supabase = { __as: "user-a" };
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/budgets/copy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  copyBudgetsFromPreviousMonth.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/budgets/copy", () => {
  it("copies last month into the given month for the verified user", async () => {
    copyBudgetsFromPreviousMonth.mockResolvedValue({ ok: true });
    const res = await POST(post({ month: "2026-09" }));
    expect(res.status).toBe(200);
    expect(copyBudgetsFromPreviousMonth).toHaveBeenCalledWith(supabase, "user-a", "2026-09");
  });

  it("answers 409 nothing_to_copy when last month had no budgets", async () => {
    copyBudgetsFromPreviousMonth.mockResolvedValue({ ok: false, error: "nothing_to_copy" });
    const res = await POST(post({ month: "2026-09" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "nothing_to_copy" });
  });

  it("treats a missing month as invalid, rejects unreadable bodies, and requires authentication", async () => {
    copyBudgetsFromPreviousMonth.mockResolvedValue({ ok: false, error: "invalid", fieldErrors: { month: "Invalid month" } });
    expect((await POST(post({}))).status).toBe(422);
    expect(copyBudgetsFromPreviousMonth).toHaveBeenCalledWith(supabase, "user-a", "");
    expect((await POST(post("nope", true))).status).toBe(400);
    getBearerContext.mockResolvedValue(null);
    expect((await POST(post({ month: "2026-09" }))).status).toBe(401);
  });
});

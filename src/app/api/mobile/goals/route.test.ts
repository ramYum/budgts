import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadGoals = vi.fn();
const profileTimeZone = vi.fn();
const createGoal = vi.fn();
const updateGoal = vi.fn();
const setGoalArchived = vi.fn();
const addContribution = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/goals/load-goals", () => ({ loadGoals: (...a: unknown[]) => loadGoals(...a) }));
vi.mock("@/lib/mobile/time-zone", () => ({ profileTimeZone: (...a: unknown[]) => profileTimeZone(...a) }));
vi.mock("@/lib/goals/commands", () => ({
  createGoal: (...a: unknown[]) => createGoal(...a),
  updateGoal: (...a: unknown[]) => updateGoal(...a),
  setGoalArchived: (...a: unknown[]) => setGoalArchived(...a),
  addContribution: (...a: unknown[]) => addContribution(...a),
}));

import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
import { POST as CONTRIBUTE } from "./[id]/contributions/route";

const GOAL = "11111111-1111-4111-8111-111111111111";
const REQ = "22222222-2222-4222-8222-222222222222";
const supabase = { __as: "user-a" };
const req = (path: string, method = "GET", body?: unknown, raw = false) =>
  new Request(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const DATA = {
  currency: "EUR",
  items: [{ id: GOAL, name: "Trip", target: 1000, saved: 250, remaining: 750, pct: 25, complete: false, targetDate: null }],
  summary: { totalTarget: 1000, totalSaved: 250, activeCount: 1, completeCount: 0 },
};

beforeEach(() => {
  for (const m of [getBearerContext, loadGoals, profileTimeZone, createGoal, updateGoal, setGoalArchived, addContribution]) m.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  profileTimeZone.mockResolvedValue("Pacific/Kiritimati");
  loadGoals.mockResolvedValue(DATA);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/goals", () => {
  it("serves loadGoals' numbers for the verified user, with their own today", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T11:00:00Z"), toFake: ["Date"] });
    const res = await GET(req("/api/mobile/goals?userId=someone-else"));
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      version: 1,
      currency: "EUR",
      today: "2026-10-01", // already tomorrow in Kiritimati (UTC+14)
      summary: DATA.summary,
      goals: DATA.items,
    });
    expect(loadGoals).toHaveBeenCalledWith(supabase, "user-a");
  });

  it("answers not_onboarded, 401 without a token, and a generic 503 when a read fails", async () => {
    profileTimeZone.mockResolvedValue(null);
    expect((await GET(req("/api/mobile/goals"))).status).toBe(409);
    profileTimeZone.mockResolvedValue("UTC");
    loadGoals.mockRejectedValue(new Error("goals_read_failed secret detail"));
    const failed = await GET(req("/api/mobile/goals"));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req("/api/mobile/goals"))).status).toBe(401);
  });
});

describe("POST /api/mobile/goals", () => {
  it("creates for the verified user, passing the request id and treating a null date as none", async () => {
    createGoal.mockResolvedValue({ ok: true, id: REQ });
    const res = await POST(req("/api/mobile/goals", "POST", { name: "Trip", targetAmount: "400", targetDate: null, requestId: REQ }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: REQ });
    expect(createGoal).toHaveBeenCalledWith(
      supabase,
      "user-a",
      { name: "Trip", targetAmount: "400", targetDate: "", requestId: REQ },
      REQ,
    );
  });

  it("maps validation to 422 with field errors, and refuses a bad body or request id", async () => {
    createGoal.mockResolvedValue({ ok: false, error: "invalid", fieldErrors: { name: "Name your goal" } });
    const res = await POST(req("/api/mobile/goals", "POST", { name: "" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid", fieldErrors: { name: "Name your goal" } });
    expect((await POST(req("/api/mobile/goals", "POST", "{nope", true))).status).toBe(400);
    expect((await POST(req("/api/mobile/goals", "POST", [1]))).status).toBe(400);
    expect((await POST(req("/api/mobile/goals", "POST", { name: "x", requestId: 7 }))).status).toBe(422);
  });

  it("never echoes a storage error", async () => {
    createGoal.mockResolvedValue({ ok: false, error: "failed", message: 'relation "savings_goals" violates ...' });
    const res = await POST(req("/api/mobile/goals", "POST", { name: "x", targetAmount: "1", targetDate: "" }));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("savings_goals");
  });
});

describe("PATCH /api/mobile/goals/:id", () => {
  it("archives or edits through the shared commands", async () => {
    setGoalArchived.mockResolvedValue({ ok: true });
    expect((await PATCH(req(`/api/mobile/goals/${GOAL}`, "PATCH", { archived: true }), params(GOAL))).status).toBe(200);
    expect(setGoalArchived).toHaveBeenCalledWith(supabase, GOAL, true);

    updateGoal.mockResolvedValue({ ok: true });
    await PATCH(req(`/api/mobile/goals/${GOAL}`, "PATCH", { name: "Car", targetAmount: "9", targetDate: null }), params(GOAL));
    expect(updateGoal).toHaveBeenCalledWith(supabase, GOAL, { name: "Car", targetAmount: "9", targetDate: "" });
  });

  it("404s a malformed or invisible id", async () => {
    expect((await PATCH(req("/api/mobile/goals/x", "PATCH", { archived: true }), params("x"))).status).toBe(404);
    setGoalArchived.mockResolvedValue({ ok: false, error: "missing" });
    expect((await PATCH(req(`/api/mobile/goals/${GOAL}`, "PATCH", { archived: false }), params(GOAL))).status).toBe(404);
  });
});

describe("POST /api/mobile/goals/:id/contributions", () => {
  it("adds (+1) or withdraws (-1) against the goal in the path", async () => {
    addContribution.mockResolvedValue({ ok: true, id: "c1" });
    const body = { kind: "withdraw", amount: "25", occurredAt: "2026-09-10", note: null, goalId: "ignored" };
    const res = await CONTRIBUTE(req(`/api/mobile/goals/${GOAL}/contributions`, "POST", body), params(GOAL));
    expect(res.status).toBe(201);
    expect(addContribution).toHaveBeenCalledWith(
      supabase,
      "user-a",
      { kind: "withdraw", amount: "25", occurredAt: "2026-09-10", note: "", goalId: GOAL },
      -1,
      undefined,
    );
  });

  it("requires a kind, and 404s another user's goal", async () => {
    const bad = await CONTRIBUTE(req(`/api/mobile/goals/${GOAL}/contributions`, "POST", { amount: "1" }), params(GOAL));
    expect(bad.status).toBe(422);
    addContribution.mockResolvedValue({ ok: false, error: "missing" });
    const gone = await CONTRIBUTE(
      req(`/api/mobile/goals/${GOAL}/contributions`, "POST", { kind: "add", amount: "1", occurredAt: "2026-09-10" }),
      params(GOAL),
    );
    expect(gone.status).toBe(404);
  });
});

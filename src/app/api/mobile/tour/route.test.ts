import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadTour = vi.fn();
const loadTourSeen = vi.fn();
const markTourSeen = vi.fn();
const hubCounts = vi.fn();
const profileTimeZone = vi.fn();
const transactionsCsv = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => true }));
vi.mock("@/lib/tour/load-tour", async (orig) => ({
  ...(await orig<typeof import("@/lib/tour/load-tour")>()),
  loadTour: (...a: unknown[]) => loadTour(...a),
  loadTourSeen: (...a: unknown[]) => loadTourSeen(...a),
  markTourSeen: (...a: unknown[]) => markTourSeen(...a),
}));
vi.mock("@/lib/hub-counts", () => ({ hubCounts: (...a: unknown[]) => hubCounts(...a) }));
vi.mock("@/lib/mobile/time-zone", () => ({ profileTimeZone: (...a: unknown[]) => profileTimeZone(...a) }));
vi.mock("@/lib/export/transactions-csv", async (orig) => ({
  ...(await orig<typeof import("@/lib/export/transactions-csv")>()),
  transactionsCsv: (...a: unknown[]) => transactionsCsv(...a),
}));

import { GET, POST } from "./route";
import { GET as HUB } from "../hub/route";
import { GET as EXPORT } from "../export/transactions/route";
import { onboardingSteps } from "@/lib/tour/load-tour";

const supabase = { __as: "user-a" };
const req = (path: string, method = "GET") => new Request(`https://example.test${path}`, { method });
const TOUR = {
  onboarded: true,
  currency: "EUR",
  accounts: [{ id: "a1", name: "Wallet" }],
  stepIds: ["sorted", "money-left"],
  offset: 3,
  totalVisible: 8,
};

beforeEach(() => {
  for (const m of [getBearerContext, loadTour, loadTourSeen, markTourSeen, hubCounts, profileTimeZone, transactionsCsv]) m.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  loadTour.mockResolvedValue(TOUR);
  loadTourSeen.mockResolvedValue(false);
  profileTimeZone.mockResolvedValue("Pacific/Kiritimati");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/tour", () => {
  it("serves the explainer cards for the verified user, continuing after Get Started when new=1", async () => {
    const res = await GET(req("/api/mobile/tour?new=1&userId=victim"));
    expect(await res.json()).toEqual({ version: 1, phase: "tour", seen: false, ...TOUR, onboarded: undefined });
    expect(loadTour).toHaveBeenCalledWith(supabase, { userId: "user-a", plaidEnabled: true, justOnboarded: true });
  });

  it("serves Get Started's cards without reading the profile", async () => {
    const res = await GET(req("/api/mobile/tour?phase=onboarding"));
    expect(await res.json()).toEqual({ version: 1, phase: "onboarding", ...onboardingSteps(true) });
    expect(loadTour).not.toHaveBeenCalled();
  });

  it("409 before a currency is picked, 422 for an unknown phase, 401 without a token", async () => {
    loadTour.mockResolvedValue({ ...TOUR, onboarded: false });
    expect((await GET(req("/api/mobile/tour"))).status).toBe(409);
    expect((await GET(req("/api/mobile/tour?phase=intro"))).status).toBe(422);
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req("/api/mobile/tour"))).status).toBe(401);
  });
});

describe("POST /api/mobile/tour", () => {
  it("marks the guide seen for the verified user (safe to repeat)", async () => {
    markTourSeen.mockResolvedValue({ ok: true });
    expect(await (await POST(req("/api/mobile/tour", "POST"))).json()).toEqual({ ok: true });
    expect(await (await POST(req("/api/mobile/tour", "POST"))).json()).toEqual({ ok: true });
    expect(markTourSeen).toHaveBeenCalledWith(supabase, "user-a");
  });

  it("maps a missing profile and a storage failure to stable codes", async () => {
    markTourSeen.mockResolvedValue({ ok: false, error: "missing" });
    expect((await POST(req("/api/mobile/tour", "POST"))).status).toBe(404);
    markTourSeen.mockResolvedValue({ ok: false, error: "failed", message: "SQL detail" });
    const res = await POST(req("/api/mobile/tour", "POST"));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("SQL");
  });
});

describe("GET /api/mobile/hub", () => {
  it("serves hubCounts for the user's own month", async () => {
    hubCounts.mockResolvedValue({ goals: 2, accounts: 3, banks: 1, categories: 9, budgets: 4 });
    expect(await (await HUB(req("/api/mobile/hub"))).json()).toEqual({
      version: 1,
      goals: 2,
      accounts: 3,
      banks: 1,
      categories: 9,
      budgets: 4,
    });
    expect(hubCounts).toHaveBeenCalledWith(supabase, "Pacific/Kiritimati");
    profileTimeZone.mockResolvedValue(null);
    expect((await HUB(req("/api/mobile/hub"))).status).toBe(409);
  });
});

describe("GET /api/mobile/export/transactions", () => {
  it("returns the shared CSV, dated with the user's own today, never cached", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T20:00:00Z"), toFake: ["Date"] });
    transactionsCsv.mockResolvedValue("date\r\n");
    const res = await EXPORT(req("/api/mobile/export/transactions"));
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("date\r\n");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="budgts-transactions-2026-10-01.csv"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(transactionsCsv).toHaveBeenCalledWith(supabase, true);
  });

  it("a failed read is a generic 503, never a partial file", async () => {
    transactionsCsv.mockRejectedValue(new Error("row 1001 lost"));
    const res = await EXPORT(req("/api/mobile/export/transactions"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

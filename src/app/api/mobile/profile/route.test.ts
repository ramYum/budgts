import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadProfile = vi.fn();
const saveTimeZone = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/profile/onboarding", () => ({
  loadProfile: (...a: unknown[]) => loadProfile(...a),
  saveTimeZone: (...a: unknown[]) => saveTimeZone(...a),
}));

import { SUPPORTED_CURRENCIES } from "@/lib/budget/currencies";
import { GET, PATCH } from "./route";

const supabase = { __as: "user-a" };
const req = () => new Request("https://example.test/api/mobile/profile");
const patch = (body: string) =>
  new Request("https://example.test/api/mobile/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });

beforeEach(() => {
  getBearerContext.mockReset();
  loadProfile.mockReset();
  saveTimeZone.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a", email: "a@example.test" }, supabase });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/profile", () => {
  it("rejects an unauthenticated request without reading anything", async () => {
    getBearerContext.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("returns the caller's email, currency, onboarding state, time zone and the currencies the app may offer", async () => {
    loadProfile.mockResolvedValue({ currency: "CAD", onboarded: false, timeZone: null });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: "a@example.test",
      currency: "CAD",
      onboarded: false,
      timeZone: null,
      supportedCurrencies: [...SUPPORTED_CURRENCIES],
    });
    expect(loadProfile).toHaveBeenCalledWith(supabase, "user-a"); // the verified user, via the caller's own client
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers profile_missing (404) when the seed trigger never created a profile", async () => {
    loadProfile.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_missing" });
  });

  it("answers a generic 503 when the read fails", async () => {
    loadProfile.mockRejectedValue(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

describe("PATCH /api/mobile/profile", () => {
  it("stores the device time zone for the verified user only", async () => {
    saveTimeZone.mockResolvedValue({ ok: true, timeZone: "Asia/Tokyo" });

    const res = await PATCH(patch(JSON.stringify({ time_zone: "Asia/Tokyo", userId: "someone-else" })));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ timeZone: "Asia/Tokyo" });
    expect(saveTimeZone).toHaveBeenCalledWith(supabase, "user-a", "Asia/Tokyo");
  });

  it.each([
    ["invalid_time_zone", 422],
    ["profile_missing", 404],
    ["update_failed", 503],
  ])("maps %s to HTTP %i with a stable code (never the storage message)", async (error, status) => {
    saveTimeZone.mockResolvedValue({ ok: false, error, message: "internal detail" });
    const res = await PATCH(patch(JSON.stringify({ time_zone: "x" })));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("answers invalid_body (400) for a body that is not a JSON object", async () => {
    for (const body of ["not json", "null", "\"Asia/Tokyo\""]) {
      const res = await PATCH(patch(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body" });
    }
    expect(saveTimeZone).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request without writing", async () => {
    getBearerContext.mockResolvedValue(null);
    const res = await PATCH(patch(JSON.stringify({ time_zone: "Asia/Tokyo" })));
    expect(res.status).toBe(401);
    expect(saveTimeZone).not.toHaveBeenCalled();
  });
});

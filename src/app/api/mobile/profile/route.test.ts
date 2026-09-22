import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadProfile = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/profile/onboarding", () => ({ loadProfile: (...a: unknown[]) => loadProfile(...a) }));

import { SUPPORTED_CURRENCIES } from "@/lib/validation/profile";
import { GET } from "./route";

const supabase = { __as: "user-a" };
const req = () => new Request("https://example.test/api/mobile/profile");

beforeEach(() => {
  getBearerContext.mockReset();
  loadProfile.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a", email: "a@example.test" }, supabase });
});

describe("GET /api/mobile/profile", () => {
  it("rejects an unauthenticated request without reading anything", async () => {
    getBearerContext.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("returns the caller's email, currency, onboarding state and the currencies the app may offer", async () => {
    loadProfile.mockResolvedValue({ currency: "CAD", onboarded: false });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: "a@example.test",
      currency: "CAD",
      onboarded: false,
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

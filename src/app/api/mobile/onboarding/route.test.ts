import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const completeOnboarding = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/profile/onboarding", () => ({ completeOnboarding: (...a: unknown[]) => completeOnboarding(...a) }));

import { POST } from "./route";

const supabase = { __as: "user-a" };
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  completeOnboarding.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a", email: "a@example.test" }, supabase });
});

describe("POST /api/mobile/onboarding", () => {
  it("rejects an unauthenticated request without touching the profile", async () => {
    getBearerContext.mockResolvedValue(null);
    const res = await POST(post({ currency: "EUR" }));
    expect(res.status).toBe(401);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("saves the chosen currency for the verified user only", async () => {
    completeOnboarding.mockResolvedValue({ ok: true, currency: "EUR" });

    const res = await POST(post({ currency: "EUR", userId: "someone-else" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ onboarded: true, currency: "EUR" });
    expect(completeOnboarding).toHaveBeenCalledWith(supabase, "user-a", { currency: "EUR", userId: "someone-else" });
    // The id the service acts on is the verified one; a userId in the body is never used as an identity.
    expect(completeOnboarding.mock.calls[0][1]).toBe("user-a");
  });

  it.each([
    ["invalid_currency", 422],
    ["profile_missing", 404],
    ["already_onboarded", 409],
    ["update_failed", 503],
  ])("maps %s to HTTP %i with a stable code", async (error, status) => {
    completeOnboarding.mockResolvedValue({ ok: false, error });
    const res = await POST(post({ currency: "EUR" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("answers invalid_body (400) for a body that is not JSON", async () => {
    const res = await POST(post("not json", true));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });
});

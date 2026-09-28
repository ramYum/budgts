import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));

import { GET } from "./route";

const req = () => new Request("https://example.test/api/mobile/session");

beforeEach(() => getBearerContext.mockReset());

describe("GET /api/mobile/session", () => {
  it("returns the verified caller's id and email, never cacheable", async () => {
    getBearerContext.mockResolvedValue({ user: { id: "user-a", email: "a@example.test" }, supabase: {} });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user-a", email: "a@example.test" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers 401 without a verified Bearer token", async () => {
    getBearerContext.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});

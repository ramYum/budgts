import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));

import { mobileError, mobileJson, mobileRoute } from "./route";

const ctx = { user: { id: "user-a", email: "a@example.test" }, supabase: { __as: "user-a" } };
const req = () => new Request("https://example.test/api/mobile/x");

beforeEach(() => getBearerContext.mockReset());

describe("mobileRoute", () => {
  it("answers 401 without running the handler when the caller is not authenticated", async () => {
    getBearerContext.mockResolvedValue(null);
    const handler = vi.fn();

    const res = await mobileRoute(handler)(req());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands the verified context and the request to the handler", async () => {
    getBearerContext.mockResolvedValue(ctx);
    const handler = vi.fn(async () => mobileJson({ ok: true }));
    const request = req();

    const res = await mobileRoute(handler)(request);

    expect(handler).toHaveBeenCalledWith(ctx, request);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("turns a thrown error into a generic 503 that leaks nothing", async () => {
    getBearerContext.mockResolvedValue(ctx);
    const res = await mobileRoute(async () => {
      throw new Error("connection to db.internal:5432 refused");
    })(req());

    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toBe(JSON.stringify({ error: "unavailable" }));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("responses", () => {
  it("mobileJson is never cacheable", () => {
    expect(mobileJson({ a: 1 }).headers.get("cache-control")).toBe("private, no-store");
  });

  it("mobileError carries a stable machine code and optional detail", async () => {
    const res = mobileError("invalid_currency", 422, { fieldErrors: { currency: "Pick one" } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid_currency", fieldErrors: { currency: "Pick one" } });
  });
});

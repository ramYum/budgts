import { afterEach, describe, expect, it, vi } from "vitest";
import { FULL_LEGAL_ENV } from "@/test-utils/legal-env";
import { GET } from "./route";

describe("GET /api/legal", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off, with no pages, until every owner fact is set", async () => {
    for (const name of Object.keys(FULL_LEGAL_ENV)) vi.stubEnv(name, "");
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ live: false, pages: [] });
  });

  it("is on, listing the four pages, once they are", async () => {
    for (const [name, value] of Object.entries(FULL_LEGAL_ENV)) vi.stubEnv(name, value);
    expect(await GET().json()).toEqual({
      live: true,
      pages: ["/privacy", "/terms", "/support", "/account-deletion"],
    });
  });
});

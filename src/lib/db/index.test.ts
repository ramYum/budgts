import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `next build` loads every route module to collect page data, and CI and
// Vercel Preview builds carry no database credentials. So importing the
// module must never need DATABASE_URL; only the first real use may.
describe("db (the Plaid pipeline's DB handle)", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("can be imported without DATABASE_URL, as a build does", async () => {
    delete process.env.DATABASE_URL;
    await expect(import("./index")).resolves.toHaveProperty("db");
  });

  it("fails loudly on first use when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const { db } = await import("./index");
    expect(() => db()).toThrow("DATABASE_URL is not set");
  });

  it("builds one handle and reuses it", async () => {
    // postgres() connects lazily, so constructing the client opens no socket.
    process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:6543/postgres";
    const { db } = await import("./index");
    const first = db();
    expect(db()).toBe(first);
    expect(typeof first.select).toBe("function");
  });
});

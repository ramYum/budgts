import { describe, expect, it, vi } from "vitest";
import { onceByKey } from "./once-by-key";

describe("onceByKey", () => {
  it("runs the work once for concurrent callers with the same key and shares the result", async () => {
    const work = vi.fn(async (key: string) => `done:${key}`);
    const run = onceByKey(work);

    const [a, b] = await Promise.all([run("u1"), run("u1")]);

    expect(work).toHaveBeenCalledTimes(1);
    expect(a).toBe("done:u1");
    expect(b).toBe("done:u1");
  });

  it("returns the same settled result to a late caller (single-use auth code)", async () => {
    const work = vi.fn(async () => ({ ok: true }));
    const run = onceByKey(work);

    const first = await run("u1");
    const late = await run("u1");

    expect(work).toHaveBeenCalledTimes(1);
    expect(late).toBe(first);
  });

  it("does not share across different keys", async () => {
    const work = vi.fn(async (key: string) => key);
    const run = onceByKey(work);

    await run("u1");
    await run("u2");

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejection forever — a later attempt may retry", async () => {
    let calls = 0;
    const run = onceByKey(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return "ok";
    });

    await expect(run("u1")).rejects.toThrow("network");
    await expect(run("u1")).resolves.toBe("ok");
  });
});

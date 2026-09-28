import { describe, expect, it, vi } from "vitest";
import { getVersion, invalidate, subscribe } from "./invalidate";

describe("invalidate", () => {
  it("bumps the version of exactly the topics named, and notifies subscribers", () => {
    const listener = vi.fn();
    const stop = subscribe(listener);
    const before = { tx: getVersion("transactions"), bud: getVersion("budgets"), acc: getVersion("accounts") };

    invalidate("transactions", "budgets");

    expect(getVersion("transactions")).toBe(before.tx + 1);
    expect(getVersion("budgets")).toBe(before.bud + 1);
    expect(getVersion("accounts")).toBe(before.acc); // untouched
    expect(listener).toHaveBeenCalledTimes(1); // one notification per call, however many topics
    stop();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const stop = subscribe(listener);
    stop();
    invalidate("home");
    expect(listener).not.toHaveBeenCalled();
  });
});

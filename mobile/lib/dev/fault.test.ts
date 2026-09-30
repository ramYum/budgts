import { afterEach, describe, expect, it } from "vitest";
import { devFault, faultResponse, setDevFaults } from "./fault";

const g = globalThis as { __DEV__?: boolean };

describe("dev-only fault injection (parity captures)", () => {
  afterEach(() => {
    g.__DEV__ = true;
    setDevFaults({});
  });

  it("fails, drops or holds only the named endpoint and what is under it", () => {
    setDevFaults({ fail: "home", hold: "budgets" });
    expect(devFault("/api/mobile/home")).toEqual({ kind: "fail" });
    expect(devFault("/api/mobile/home?month=2026-09")).toEqual({ kind: "fail" });
    expect(devFault("/api/mobile/homework")).toBeNull();
    expect(devFault("/api/mobile/budgets/copy")).toEqual({ kind: "hold" });
    expect(devFault("/api/mobile/status")).toBeNull();
    setDevFaults({ fail: "home:offline" });
    expect(devFault("/api/mobile/home")).toEqual({ kind: "offline" });
  });

  it("ignores anything that isn't a plain endpoint name", () => {
    setDevFaults({ fail: "../../etc", hold: ["status", "x"] });
    expect(devFault("/api/mobile/etc")).toBeNull();
    expect(devFault("/api/mobile/status")).toEqual({ kind: "hold" });
  });

  it("does nothing in a release build", () => {
    setDevFaults({ fail: "home" });
    g.__DEV__ = false;
    expect(devFault("/api/mobile/home")).toBeNull();
    setDevFaults({ fail: "home" });
    g.__DEV__ = true;
    expect(devFault("/api/mobile/home")).toBeNull(); // set while "release": nothing was stored
  });

  it("answers the way each state needs", async () => {
    expect((await faultResponse({ kind: "fail" })).status).toBe(503);
    await expect(faultResponse({ kind: "offline" })).rejects.toBeInstanceOf(TypeError);
  });
});

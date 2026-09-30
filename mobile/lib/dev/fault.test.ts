import { afterEach, describe, expect, it } from "vitest";
import { applyDevLink, devFaultResponse, devLinkParams, faultFor, parseDevLink, resetDevLink } from "./fault";
import { parityClockMs } from "../motion/parity-clock";

afterEach(() => resetDevLink());

describe("parity dev links", () => {
  it("reads fail, hold and clock from a deep link and ignores anything else", () => {
    expect(parseDevLink("budgts://budgets?fail=budgets,home&hold=activity&clock=4000&m=2026-09")).toEqual({
      fail: ["budgets", "home"],
      hold: ["activity"],
      clockMs: 4000,
    });
    expect(parseDevLink("budgts://budgets")).toEqual({ fail: [], hold: [], clockMs: null });
    expect(parseDevLink("budgts://x?clock=-5&fail=<script>")).toEqual({ fail: [], hold: [], clockMs: null });
  });

  it("each link replaces the last one's params", () => {
    applyDevLink("budgts://?fail=home", true);
    applyDevLink("budgts://budgets", true);
    expect(devLinkParams(true)).toEqual({ fail: [], hold: [], clockMs: null });
  });

  it("fails or holds only the named endpoints", async () => {
    applyDevLink("budgts://?fail=home&hold=activity", true);
    expect(faultFor("/api/mobile/home?m=2026-09", true)).toBe("fail");
    expect(faultFor("/api/mobile/activity", true)).toBe("hold");
    expect(faultFor("/api/mobile/homework", true)).toBeNull();
    expect(faultFor("/api/mobile/profile", true)).toBeNull();
    const res = await devFaultResponse("/api/mobile/home", true);
    expect(res?.status).toBe(503);
    expect(await res?.json()).toEqual({ error: "parity_fault" });
  });

  it("pins the parity clock", () => {
    applyDevLink("budgts://?clock=1200", true);
    expect(parityClockMs(true)).toBe(1200);
  });

  it("is inert when __DEV__ is false (release builds)", () => {
    applyDevLink("budgts://?fail=home&clock=900", false);
    expect(devLinkParams(true)).toEqual({ fail: [], hold: [], clockMs: null }); // nothing was taken
    applyDevLink("budgts://?fail=home&clock=900", true);
    expect(faultFor("/api/mobile/home", false)).toBeNull();
    expect(devFaultResponse("/api/mobile/home", false)).toBeNull();
    expect(parityClockMs(false)).toBeNull();
    expect(devLinkParams(false)).toEqual({ fail: [], hold: [], clockMs: null });
  });

  it("defaults to off outside React Native (no __DEV__ global)", () => {
    applyDevLink("budgts://?fail=home");
    expect(devLinkParams(true).fail).toEqual([]);
    expect(devFaultResponse("/api/mobile/home")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildTourSteps } from "./steps";

function ids(result: ReturnType<typeof buildTourSteps>) {
  return result.steps.map((s) => s.id);
}

describe("buildTourSteps", () => {
  describe("phase: onboarding", () => {
    it("opens with Crystal, then welcome, auto-capture, currency when Plaid is on", () => {
      const result = buildTourSteps({
        phase: "onboarding",
        plaidEnabled: true,
        hasBank: false,
        justOnboarded: false,
      });
      expect(ids(result)).toEqual(["crystal", "welcome", "auto-capture", "currency"]);
    });

    it("hides auto-capture when Plaid is off", () => {
      const result = buildTourSteps({
        phase: "onboarding",
        plaidEnabled: false,
        hasBank: false,
        justOnboarded: false,
      });
      expect(ids(result)).toEqual(["crystal", "welcome", "currency"]);
    });

    it("has no offset, and counts the whole guide so progress never jumps at /tour", () => {
      for (const plaidEnabled of [true, false]) {
        const result = buildTourSteps({ phase: "onboarding", plaidEnabled, hasBank: false, justOnboarded: false });
        const tour = buildTourSteps({ phase: "tour", plaidEnabled, hasBank: false, justOnboarded: true });
        expect(result.offset).toBe(0);
        expect(result.totalVisible).toBe(tour.totalVisible);
        expect(result.totalVisible).toBe(result.steps.length + tour.steps.length);
      }
    });
  });

  describe("phase: tour", () => {
    it("includes bank, auto-sort, money-left, plan, done when Plaid is on and no bank connected", () => {
      const result = buildTourSteps({
        phase: "tour",
        plaidEnabled: true,
        hasBank: false,
        justOnboarded: true,
      });
      expect(ids(result)).toEqual(["bank", "auto-sort", "money-left", "plan", "done"]);
    });

    it("hides bank when the user already has a connected bank", () => {
      const result = buildTourSteps({
        phase: "tour",
        plaidEnabled: true,
        hasBank: true,
        justOnboarded: true,
      });
      expect(ids(result)).toEqual(["auto-sort", "money-left", "plan", "done"]);
    });

    it("hides bank and auto-sort when Plaid is off", () => {
      const result = buildTourSteps({
        phase: "tour",
        plaidEnabled: false,
        hasBank: false,
        justOnboarded: true,
      });
      expect(ids(result)).toEqual(["money-left", "plan", "done"]);
    });

    it("prepends Crystal, welcome + auto-capture when arriving without ?new=1 (replay / pre-migration visit)", () => {
      const result = buildTourSteps({
        phase: "tour",
        plaidEnabled: true,
        hasBank: true,
        justOnboarded: false,
      });
      expect(ids(result)).toEqual(["crystal", "welcome", "auto-capture", "auto-sort", "money-left", "plan", "done"]);
    });

    it("the prepended intro also respects Plaid being off", () => {
      const result = buildTourSteps({
        phase: "tour",
        plaidEnabled: false,
        hasBank: false,
        justOnboarded: false,
      });
      expect(ids(result)).toEqual(["crystal", "welcome", "money-left", "plan", "done"]);
    });

    it("always ends with done", () => {
      for (const plaidEnabled of [true, false]) {
        for (const hasBank of [true, false]) {
          for (const justOnboarded of [true, false]) {
            const result = buildTourSteps({ phase: "tour", plaidEnabled, hasBank, justOnboarded });
            expect(result.steps.at(-1)?.id).toBe("done");
          }
        }
      }
    });

    it("continues the dot count from onboarding when justOnboarded is true", () => {
      const onboarding = buildTourSteps({
        phase: "onboarding",
        plaidEnabled: true,
        hasBank: false,
        justOnboarded: false,
      });
      const tour = buildTourSteps({
        phase: "tour",
        plaidEnabled: true,
        hasBank: false,
        justOnboarded: true,
      });
      expect(tour.offset).toBe(onboarding.steps.length);
      expect(tour.totalVisible).toBe(tour.offset + tour.steps.length);
    });

    it("has no dot offset on a replay (nothing shown earlier this visit)", () => {
      const result = buildTourSteps({
        phase: "tour",
        plaidEnabled: true,
        hasBank: false,
        justOnboarded: false,
      });
      expect(result.offset).toBe(0);
    });
  });
});

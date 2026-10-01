import { describe, expect, it } from "vitest";
import { GOAL_GONE, submittedOf } from "./submit";

describe("a goal save's outcome, as the goal sheets read it (the web's server/savings.ts toState, plus replayed)", () => {
  it("a save is null, a replayed create says so, a refusal is the web's line", () => {
    expect(submittedOf({ status: "ok", id: "g" }, "Invalid goal")).toBeNull();
    expect(submittedOf({ status: "ok", id: "g", replayed: true }, "Invalid goal")).toEqual({ replayed: true });
    expect(submittedOf({ status: "invalid", fieldErrors: { name: "Name is required" } }, "Invalid goal")).toBe("Name is required");
    expect(submittedOf({ status: "invalid", fieldErrors: {} }, "Invalid goal")).toBe("Invalid goal");
    expect(submittedOf({ status: "missing" }, "Invalid goal")).toBe(GOAL_GONE);
    expect(submittedOf({ status: "error", kind: "network", message: "Couldn't reach Budgts." }, "Invalid goal")).toBe("Couldn't reach Budgts.");
    expect(submittedOf({ status: "conflict" }, "Invalid goal")).toBe("Something went wrong. Please try again.");
  });
});

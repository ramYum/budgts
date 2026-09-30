import { describe, expect, it } from "vitest";
import { budgetsLink, readBudgetsParams } from "./params";

const ID = "3f2c1a9e-8b7d-4c6e-9f10-112233445566";

describe("readBudgetsParams (web budgets/page.tsx)", () => {
  it("defaults to the current month, This month, nothing open", () => {
    expect(readBudgetsParams({}, "2026-09")).toEqual({ month: "2026-09", range: "month", edit: null });
  });

  it("takes a valid m and ignores a malformed one", () => {
    expect(readBudgetsParams({ m: "2026-07" }, "2026-09").month).toBe("2026-07");
    expect(readBudgetsParams({ m: "2026-7" }, "2026-09").month).toBe("2026-09");
    expect(readBudgetsParams({ m: ["2026-07"] }, "2026-09").month).toBe("2026-09");
  });

  it("is All time only for range=all", () => {
    expect(readBudgetsParams({ range: "all" }, "2026-09").range).toBe("all");
    expect(readBudgetsParams({ range: "month" }, "2026-09").range).toBe("month");
    expect(readBudgetsParams({ range: "year" }, "2026-09").range).toBe("month");
  });

  it("opens a uuid's budget for editing in This month only (Home's Set budget)", () => {
    expect(readBudgetsParams({ m: "2026-08", edit: ID }, "2026-09")).toEqual({ month: "2026-08", range: "month", edit: ID });
    expect(readBudgetsParams({ edit: "groceries" }, "2026-09").edit).toBeNull();
    expect(readBudgetsParams({ edit: ID, range: "all" }, "2026-09").edit).toBeNull();
  });

  it("builds the web's links", () => {
    expect(budgetsLink.edit("2026-09", ID)).toEqual({ pathname: "/budgets", params: { m: "2026-09", edit: ID } });
    expect(budgetsLink.activity("2026-09", ID)).toEqual({ pathname: "/activity", params: { m: "2026-09", category: ID } });
  });
});

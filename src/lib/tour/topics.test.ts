import { describe, expect, it } from "vitest";
import { TOUR_TOPICS, getTopic, neighbors } from "./topics";

describe("TOUR_TOPICS", () => {
  it("covers the six 'How Budgts Works' questions in walkthrough order", () => {
    expect(TOUR_TOPICS.map((t) => t.id)).toEqual([
      "organize",
      "money-left",
      "categorization",
      "disconnect",
      "excluded-account",
      "connect-bank",
    ]);
  });

  it("uses the agreed answer copy verbatim for the five FAQ questions", () => {
    expect(getTopic("organize")?.answer).toBe(
      "Connect a bank and Budgts imports and categorizes transactions automatically. You can also add anything by hand — cash, or accounts your bank can't reach.",
    );
    expect(getTopic("money-left")?.answer).toBe(
      "Money Left is what's left after spending is subtracted from income for the month. It doesn't measure a savings-account balance — it's a snapshot of the month's flow.",
    );
    expect(getTopic("categorization")?.answer).toBe(
      "Budgts files obvious transactions automatically. When it isn't confident, it asks once — your answer is remembered for that merchant next time.",
    );
    expect(getTopic("disconnect")?.answer).toBe(
      "Disconnecting stops new transactions from syncing. Everything already imported stays in your history and keeps counting toward budgets, unless you explicitly choose to delete it.",
    );
    expect(getTopic("excluded-account")?.answer).toBe(
      "Only you can exclude an account, and only after Budgts flags it for review — usually because its feed looked unreliable (e.g. duplicated activity). Exclusion never happens automatically.",
    );
  });

  it("has unique ids and a non-empty question and answer for every topic", () => {
    const ids = TOUR_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOUR_TOPICS) {
      expect(t.question.trim()).not.toBe("");
      expect(t.answer.trim()).not.toBe("");
    }
  });
});

describe("getTopic", () => {
  it("returns undefined for an unknown slug (route must 404, not crash)", () => {
    expect(getTopic("nope")).toBeUndefined();
  });
});

describe("neighbors", () => {
  it("has no previous on the first topic and no next on the last", () => {
    expect(neighbors("organize")).toMatchObject({ prev: null, next: "money-left", index: 0, total: 6 });
    expect(neighbors("connect-bank")).toMatchObject({ prev: "excluded-account", next: null, index: 5, total: 6 });
  });

  it("links a middle topic both ways", () => {
    expect(neighbors("categorization")).toMatchObject({ prev: "money-left", next: "disconnect" });
  });
});

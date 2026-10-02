import { describe, expect, it } from "vitest";
import { planReconnectAdoption, type DetachedBankRow, type ReconnectCandidate } from "./reconnect-adoption";

const det = (over: Partial<DetachedBankRow> & { id: string }): DetachedBankRow => ({
  accountId: "acct-1",
  pending: false,
  rawDate: "2026-09-10",
  rawAmount: 12.5,
  rawName: "Coffee",
  importedAtMs: 1_000,
  ...over,
});
const nw = (over: Partial<ReconnectCandidate> & { sourceRef: string }): ReconnectCandidate => ({
  accountId: "acct-1",
  pending: false,
  rawDate: "2026-09-10",
  rawAmount: 12.5,
  rawName: "Coffee",
  connectedAtMs: 2_000,
  ...over,
});

describe("planReconnectAdoption: a reconnected bank's history re-attaches to the rows kept from the old connection", () => {
  it("adopts the kept row for the same bank transaction instead of importing it again", () => {
    const plan = planReconnectAdoption([nw({ sourceRef: "new-1" })], [det({ id: "old-1" })]);
    expect([...plan.adopt]).toEqual([["new-1", "old-1"]]);
    expect(plan.supersededPending).toEqual([]);
  });

  it("matches one to one: two identical coffees stay two, a third new one is imported", () => {
    const plan = planReconnectAdoption(
      [nw({ sourceRef: "n1" }), nw({ sourceRef: "n2" }), nw({ sourceRef: "n3" })],
      [det({ id: "o1" }), det({ id: "o2" })],
    );
    expect(plan.adopt.size).toBe(2);
    expect(new Set(plan.adopt.values())).toEqual(new Set(["o1", "o2"]));
  });

  it("never adopts across Budgts accounts, dates, amounts, money direction or pending state", () => {
    const plan = planReconnectAdoption(
      [
        nw({ sourceRef: "other-account", accountId: "acct-2" }),
        nw({ sourceRef: "other-day", rawDate: "2026-09-11" }),
        nw({ sourceRef: "other-amount", rawAmount: 12.51 }),
        nw({ sourceRef: "refund", rawAmount: -12.5 }),
        nw({ sourceRef: "pending", pending: true }),
      ],
      [det({ id: "o1" })],
    );
    expect(plan.adopt.size).toBe(0);
  });

  it("prefers the kept row with the same name when two same-day same-amount rows differ by merchant", () => {
    const plan = planReconnectAdoption(
      [nw({ sourceRef: "n-tea", rawName: "Tea" }), nw({ sourceRef: "n-coffee", rawName: "Coffee" })],
      [det({ id: "o-coffee", rawName: "Coffee" }), det({ id: "o-tea", rawName: "Tea" })],
    );
    expect(plan.adopt.get("n-tea")).toBe("o-tea");
    expect(plan.adopt.get("n-coffee")).toBe("o-coffee");
  });

  it("is deterministic regardless of input order", () => {
    const news = [nw({ sourceRef: "b" }), nw({ sourceRef: "a" })];
    const olds = [det({ id: "y" }), det({ id: "x" })];
    const one = planReconnectAdoption(news, olds);
    const two = planReconnectAdoption([...news].reverse(), [...olds].reverse());
    expect([...one.adopt].sort()).toEqual([...two.adopt].sort());
    expect(one.adopt.get("a")).toBe("x");
  });

  it("adopts a still-pending purchase pending to pending, so Plaid's later posting replaces it once", () => {
    const plan = planReconnectAdoption([nw({ sourceRef: "n-p", pending: true })], [det({ id: "o-p", pending: true })]);
    expect(plan.adopt.get("n-p")).toBe("o-p");
  });

  it("supersedes a kept PENDING row the new history covers but no longer lists as pending (it posted or was cancelled)", () => {
    const plan = planReconnectAdoption(
      [nw({ sourceRef: "posted", rawDate: "2026-09-08", rawAmount: 14.0 })],
      [det({ id: "stale-pending", pending: true, rawDate: "2026-09-09", rawAmount: 12.0 })],
    );
    expect(plan.supersededPending).toEqual(["stale-pending"]);
  });

  it("never supersedes a kept pending row dated before the new history starts, or on another account", () => {
    const plan = planReconnectAdoption(
      [nw({ sourceRef: "n", rawDate: "2026-09-10" })],
      [det({ id: "older", pending: true, rawDate: "2026-09-01" }), det({ id: "elsewhere", pending: true, accountId: "acct-2" })],
    );
    expect(plan.supersededPending).toEqual([]);
  });

  it("never supersedes a POSTED kept row: those are real history", () => {
    const plan = planReconnectAdoption([nw({ sourceRef: "n", rawAmount: 1 })], [det({ id: "posted-old", rawAmount: 99 })]);
    expect(plan.supersededPending).toEqual([]);
    expect(plan.adopt.size).toBe(0);
  });

  it("does nothing without kept rows", () => {
    const plan = planReconnectAdoption([nw({ sourceRef: "n" })], []);
    expect(plan.adopt.size).toBe(0);
    expect(plan.supersededPending).toEqual([]);
  });

  it("a bank connected BEFORE the kept rows were imported (a second bank mapped into the same account) never adopts or supersedes them", () => {
    const plan = planReconnectAdoption(
      [nw({ sourceRef: "other-bank", connectedAtMs: 500 }), nw({ sourceRef: "other-bank-earlier", connectedAtMs: 500, rawDate: "2026-09-01", rawAmount: 3 })],
      [det({ id: "o1" }), det({ id: "o-pending", pending: true, rawDate: "2026-09-05" })],
    );
    expect(plan.adopt.size).toBe(0);
    expect(plan.supersededPending).toEqual([]);
  });
});

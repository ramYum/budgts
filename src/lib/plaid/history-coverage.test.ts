import { describe, expect, it } from "vitest";
import { buildLimitedHistoryMessages, hasLimitedHistory } from "./history-coverage";

describe("hasLimitedHistory", () => {
  it("is false when the account has no transactions yet", () => {
    expect(hasLimitedHistory("2026-09-11T14:45:00+00:00", null)).toBe(false);
  });

  it("is true when the earliest transaction lands the same calendar day the item was connected", () => {
    expect(hasLimitedHistory("2026-09-11T14:45:00+00:00", "2026-09-11T00:00:00+00:00")).toBe(true);
  });

  it("is true when the earliest transaction is after the connection date", () => {
    expect(hasLimitedHistory("2026-09-11T14:45:00+00:00", "2026-09-13T00:00:00+00:00")).toBe(true);
  });

  it("is false when real history precedes the connection date, even by one day", () => {
    expect(hasLimitedHistory("2026-09-11T14:45:00+00:00", "2026-09-10T00:00:00+00:00")).toBe(false);
  });

  it("is false when a full 90-day-ish backfill precedes the connection date", () => {
    expect(hasLimitedHistory("2026-09-11T14:45:00+00:00", "2026-06-25T00:00:00+00:00")).toBe(false);
  });
});

describe("buildLimitedHistoryMessages", () => {
  it("returns one message per flagged connection, naming the institution and the earliest date", () => {
    const messages = buildLimitedHistoryMessages([
      { institutionName: "SoFi", connectedAt: "2026-09-11T14:45:00+00:00", earliestTxnAt: "2026-09-11T00:00:00+00:00" },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/SoFi/);
    expect(messages[0]).toMatch(/Sep 11/);
    expect(messages[0]).toMatch(/won't appear in your budgets/i);
  });

  it("omits a connection with real backfilled history", () => {
    const messages = buildLimitedHistoryMessages([
      {
        institutionName: "Capital One",
        connectedAt: "2026-09-11T14:45:00+00:00",
        earliestTxnAt: "2026-06-25T00:00:00+00:00",
      },
    ]);
    expect(messages).toHaveLength(0);
  });

  it("omits a connection with no transactions yet", () => {
    const messages = buildLimitedHistoryMessages([
      { institutionName: "Ally", connectedAt: "2026-09-11T14:45:00+00:00", earliestTxnAt: null },
    ]);
    expect(messages).toHaveLength(0);
  });

  it("reports each flagged connection independently, in the same order given", () => {
    const messages = buildLimitedHistoryMessages([
      { institutionName: "SoFi", connectedAt: "2026-09-11T00:00:00+00:00", earliestTxnAt: "2026-09-11T00:00:00+00:00" },
      {
        institutionName: "Capital One",
        connectedAt: "2026-09-11T00:00:00+00:00",
        earliestTxnAt: "2026-06-25T00:00:00+00:00",
      },
      { institutionName: "Chime", connectedAt: "2026-09-12T00:00:00+00:00", earliestTxnAt: "2026-09-12T00:00:00+00:00" },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatch(/SoFi/);
    expect(messages[1]).toMatch(/Chime/);
  });

  it("falls back to generic wording when the institution name is unknown", () => {
    const messages = buildLimitedHistoryMessages([
      { institutionName: null, connectedAt: "2026-09-11T00:00:00+00:00", earliestTxnAt: "2026-09-11T00:00:00+00:00" },
    ]);
    expect(messages[0]).toMatch(/this connection/i);
  });
});

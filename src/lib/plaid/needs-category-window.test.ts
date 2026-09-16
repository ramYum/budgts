import { describe, expect, it } from "vitest";
import { applyNeedsCategoryFilter, categorizationWindow } from "./needs-category-window";

describe("categorizationWindow", () => {
  it("starts at the 1st of the signup month, 00:00 UTC", () => {
    const { start } = categorizationWindow("2026-09-11T14:22:33.919Z");
    expect(start).toBe("2026-09-01T00:00:00.000Z");
  });

  it("ends the day AFTER the signup date, 00:00 UTC (half-open, includes the whole signup day)", () => {
    const { end } = categorizationWindow("2026-09-11T14:22:33.919Z");
    expect(end).toBe("2026-09-12T00:00:00.000Z");
  });

  it("handles a signup on the 1st of the month", () => {
    const { start, end } = categorizationWindow("2026-03-01T00:00:00.000Z");
    expect(start).toBe("2026-03-01T00:00:00.000Z");
    expect(end).toBe("2026-03-02T00:00:00.000Z");
  });

  it("rolls the end over into the next month when signup is the last day of the month", () => {
    const { start, end } = categorizationWindow("2026-01-31T23:59:59.999Z");
    expect(start).toBe("2026-01-01T00:00:00.000Z");
    expect(end).toBe("2026-02-01T00:00:00.000Z");
  });

  it("is unaffected by the time-of-day component of the signup timestamp", () => {
    const late = categorizationWindow("2026-09-11T23:59:59.999Z");
    const early = categorizationWindow("2026-09-11T00:00:00.000Z");
    expect(late).toEqual(early);
  });

  it("accepts a Date as well as an ISO string", () => {
    const fromString = categorizationWindow("2026-09-11T14:22:33.919Z");
    const fromDate = categorizationWindow(new Date("2026-09-11T14:22:33.919Z"));
    expect(fromDate).toEqual(fromString);
  });
});

/**
 * A minimal fake Postgrest-like query builder: each filter call narrows an
 * in-memory row array, and records the calls made so two independent uses of
 * `applyNeedsCategoryFilter` can be proven identical (the drift the bell and
 * queue must never have between them).
 */
type Row = {
  id: string;
  source: string;
  category_id: string | null;
  removed_at: string | null;
  is_transfer: boolean;
  duplicate_of_id: string | null;
  occurred_at: string;
  event_role: string | null;
  transfer_user_set: boolean;
};

/** Parses a Postgrest `.or()` filter string into column/op/value clauses, splitting on top-level commas only (a `not.in.(A,B)` value's internal comma must survive). */
function parseOrClauses(filter: string): { column: string; op: string; value: string }[] {
  const clauses: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < filter.length; i++) {
    if (filter[i] === "(") depth++;
    else if (filter[i] === ")") depth--;
    else if (filter[i] === "," && depth === 0) {
      clauses.push(filter.slice(start, i));
      start = i + 1;
    }
  }
  clauses.push(filter.slice(start));
  return clauses.map((clause) => {
    const [column, ...rest] = clause.split(".");
    const opParts = rest.slice(0, rest.length - 1);
    // "not.in.(A,B)" → op "not.in", value "(A,B)"; "is.null" → op "is", value "null"
    const value = rest[rest.length - 1];
    return { column, op: opParts.join("."), value };
  });
}

function matchesClause(r: Row, clause: { column: string; op: string; value: string }): boolean {
  const field = (r as Record<string, unknown>)[clause.column];
  if (clause.op === "is") return clause.value === "null" ? field === null : String(field) === clause.value;
  if (clause.op === "eq") return String(field) === clause.value;
  if (clause.op === "not.in") {
    const list = clause.value.replace(/^\(|\)$/g, "").split(",");
    return field === null || !list.includes(String(field));
  }
  throw new Error(`FakeQuery.or: unsupported op "${clause.op}"`);
}

class FakeQuery {
  calls: [string, string, unknown][] = [];
  constructor(private rows: Row[]) {}
  eq(column: string, value: unknown): this {
    this.calls.push(["eq", column, value]);
    this.rows = this.rows.filter((r) => (r as Record<string, unknown>)[column] === value);
    return this;
  }
  is(column: string, value: null): this {
    this.calls.push(["is", column, value]);
    this.rows = this.rows.filter((r) => (r as Record<string, unknown>)[column] === value);
    return this;
  }
  gte(column: string, value: string): this {
    this.calls.push(["gte", column, value]);
    this.rows = this.rows.filter((r) => String((r as Record<string, unknown>)[column]) >= value);
    return this;
  }
  lt(column: string, value: string): this {
    this.calls.push(["lt", column, value]);
    this.rows = this.rows.filter((r) => String((r as Record<string, unknown>)[column]) < value);
    return this;
  }
  or(filter: string): this {
    this.calls.push(["or", filter, undefined]);
    const clauses = parseOrClauses(filter);
    this.rows = this.rows.filter((r) => clauses.some((c) => matchesClause(r, c)));
    return this;
  }
  run(): Row[] {
    return this.rows;
  }
}

const SIGNUP = "2026-09-11T14:22:33.919Z"; // window: [2026-09-01, 2026-09-12)

function row(over: Partial<Row>): Row {
  return {
    id: "row",
    source: "bank",
    category_id: null,
    removed_at: null,
    is_transfer: false,
    duplicate_of_id: null,
    occurred_at: "2026-09-05T00:00:00.000Z",
    event_role: null,
    transfer_user_set: false,
    ...over,
  };
}

describe("applyNeedsCategoryFilter", () => {
  it("keeps an otherwise-uncategorized transaction inside the signup-month-to-signup-date window", () => {
    const inWindow = row({ id: "in-window", occurred_at: "2026-09-05T00:00:00.000Z" });
    const q = new FakeQuery([inWindow]);
    const result = applyNeedsCategoryFilter(q, SIGNUP).run();
    expect(result.map((r) => r.id)).toEqual(["in-window"]);
  });

  it("excludes a transaction dated before the signup month started", () => {
    const before = row({ id: "before", occurred_at: "2026-08-31T23:59:59.999Z" });
    const q = new FakeQuery([before]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run()).toEqual([]);
  });

  it("excludes a transaction dated after the signup date", () => {
    const after = row({ id: "after", occurred_at: "2026-09-12T00:00:00.000Z" });
    const q = new FakeQuery([after]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run()).toEqual([]);
  });

  it("includes the signup date itself regardless of time-of-day", () => {
    const onSignupDate = row({ id: "signup-day", occurred_at: "2026-09-11T23:00:00.000Z" });
    const q = new FakeQuery([onSignupDate]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run().map((r) => r.id)).toEqual(["signup-day"]);
  });

  it("excludes a transaction with duplicate_of_id set, even inside the window", () => {
    const dup = row({ id: "dup", occurred_at: "2026-09-05T00:00:00.000Z", duplicate_of_id: "canonical-id" });
    const q = new FakeQuery([dup]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run()).toEqual([]);
  });

  it("excludes a categorized, removed, transfer, or non-bank row inside the window", () => {
    const categorized = row({ id: "categorized", category_id: "cat-1" });
    const removed = row({ id: "removed", removed_at: "2026-09-05T00:00:00.000Z" });
    const transfer = row({ id: "transfer", is_transfer: true });
    const manual = row({ id: "manual", source: "manual" });
    const q = new FakeQuery([categorized, removed, transfer, manual]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run()).toEqual([]);
  });

  it("excludes a CARD_PAYMENT-role row even though it has no category (e.g. paying off a credit card)", () => {
    const cardPayment = row({ id: "card-payment", event_role: "CARD_PAYMENT" });
    const q = new FakeQuery([cardPayment]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run()).toEqual([]);
  });

  it("excludes a CASH_ADVANCE-role row the same way", () => {
    const cashAdvance = row({ id: "cash-advance", event_role: "CASH_ADVANCE" });
    const q = new FakeQuery([cashAdvance]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run()).toEqual([]);
  });

  it("still includes an unresolved or spend-shaped row that merely lacks a category", () => {
    const unresolved = row({ id: "unresolved", event_role: null });
    const purchase = row({ id: "purchase", event_role: "PURCHASE" });
    const q = new FakeQuery([unresolved, purchase]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run().map((r) => r.id).sort()).toEqual(["purchase", "unresolved"]);
  });

  it("keeps a CARD_PAYMENT row in the queue when the user explicitly overrode the transfer decision (transfer_user_set)", () => {
    // Mirrors qualify.ts's countsForMonth precedence: an explicit user decision
    // outranks the machine-resolved event_role, so a row the user pulled back
    // into "real spend" must still surface where they'd actually assign it a
    // category, not be silently hidden by the CARD_PAYMENT exclusion.
    const overridden = row({ id: "overridden", event_role: "CARD_PAYMENT", transfer_user_set: true });
    const q = new FakeQuery([overridden]);
    expect(applyNeedsCategoryFilter(q, SIGNUP).run().map((r) => r.id)).toEqual(["overridden"]);
  });

  it("applies the exact same filter calls regardless of which caller (bell or queue) invokes it", () => {
    const bellQuery = new FakeQuery([]);
    const queueQuery = new FakeQuery([]);
    applyNeedsCategoryFilter(bellQuery, SIGNUP);
    applyNeedsCategoryFilter(queueQuery, SIGNUP);
    expect(bellQuery.calls).toEqual(queueQuery.calls);
    // and the window bounds inside those calls come from categorizationWindow,
    // not a second, independently-typed-out copy of the date math
    const { start, end } = categorizationWindow(SIGNUP);
    expect(bellQuery.calls).toContainEqual(["gte", "occurred_at", start]);
    expect(bellQuery.calls).toContainEqual(["lt", "occurred_at", end]);
  });
});

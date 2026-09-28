import { describe, expect, it } from "vitest";
import { fromPostgres } from "./db";

/**
 * The production connection is drizzle's postgres-js client, and drizzle REPLACES that client's date serializers and
 * parsers with pass-throughs (it does its own conversion). So through the raw `unsafe()` the billing store uses, a Date
 * parameter cannot be serialized and timestamptz columns come back as strings. The adapter has to hide both, so the
 * domain code sees the same thing it sees on embedded Postgres: Dates in, Dates out. (Found only by running the store
 * over a real drizzle-wrapped connection; PGlite handles Dates natively and hid it.)
 */
function fakeClient(rows: Record<string, unknown>[], columns: { name: string; type: number }[]) {
  const seen: { text: string; params: unknown[] }[] = [];
  const result = Object.assign([...rows], { columns });
  const client = {
    unsafe: async (text: string, params: unknown[]) => {
      seen.push({ text, params });
      return result;
    },
    begin: async (fn: (t: unknown) => Promise<unknown>) => fn(client),
  };
  return { client: client as never, seen };
}

describe("fromPostgres: the drizzle-wrapped connection cannot take Dates or return them", () => {
  it("sends a Date parameter as an ISO string", async () => {
    const { client, seen } = fakeClient([], []);
    const at = new Date("2026-10-15T12:00:00.000Z");
    await fromPostgres(client).query("select $1::timestamptz", [at, "x", 7, null]);
    expect(seen[0].params).toEqual(["2026-10-15T12:00:00.000Z", "x", 7, null]);
  });

  it("returns timestamptz columns (oid 1184) as Dates and leaves every other column alone", async () => {
    const { client } = fakeClient(
      [{ at: "2026-09-21 19:06:17.204+00", none: null, label: "2026-09-21 19:06:17+00", n: 5 }],
      [
        { name: "at", type: 1184 },
        { name: "none", type: 1184 },
        { name: "label", type: 25 }, // a text column that merely LOOKS like a timestamp must stay a string
        { name: "n", type: 23 },
      ],
    );
    const [row] = await fromPostgres(client).query<{ at: Date; none: null; label: string; n: number }>("select 1");
    expect(row.at).toBeInstanceOf(Date);
    expect(row.at.toISOString()).toBe("2026-09-21T19:06:17.204Z");
    expect(row.none).toBeNull();
    expect(row.label).toBe("2026-09-21 19:06:17+00");
    expect(row.n).toBe(5);
  });

  it("does the same inside a transaction", async () => {
    const { client, seen } = fakeClient([{ at: "2026-09-21 19:06:17+00" }], [{ name: "at", type: 1184 }]);
    const rows = await fromPostgres(client).transaction((tx) => tx.query<{ at: Date }>("select 1", [new Date("2026-01-01T00:00:00Z")]));
    expect(seen[0].params).toEqual(["2026-01-01T00:00:00.000Z"]);
    expect(rows[0].at).toBeInstanceOf(Date);
  });

  it("passes rows through untouched when the driver reports no column metadata", async () => {
    const { client } = fakeClient([{ a: 1 }], []);
    expect(await fromPostgres(client).query("select 1")).toEqual([{ a: 1 }]);
  });
});

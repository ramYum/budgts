import { describe, expect, it } from "vitest";
import { computeContentFingerprint } from "./content-fingerprint";

describe("computeContentFingerprint", () => {
  it("is stable for the same payload regardless of key order", () => {
    const a = { transaction_id: "A", amount: -12.56, name: "Starbucks", date: "2026-07-19" };
    const b = { date: "2026-07-19", name: "Starbucks", amount: -12.56, transaction_id: "A" };
    expect(computeContentFingerprint(a)).toBe(computeContentFingerprint(b));
  });

  it("ignores transaction_id — two payloads differing only in transaction_id fingerprint the same", () => {
    const a = { transaction_id: "AAA111", amount: -33.5, name: "DoorDash", date: "2026-08-12" };
    const b = { transaction_id: "ZZZ999", amount: -33.5, name: "DoorDash", date: "2026-08-12" };
    expect(computeContentFingerprint(a)).toBe(computeContentFingerprint(b));
  });

  it("differs when any other field differs", () => {
    const a = { transaction_id: "A", amount: -33.5, name: "DoorDash", date: "2026-08-12" };
    const b = { transaction_id: "B", amount: -33.5, name: "DoorDash", date: "2026-08-13" }; // different date
    expect(computeContentFingerprint(a)).not.toBe(computeContentFingerprint(b));
  });

  it("is stable across nested key order too (e.g. location, payment_meta)", () => {
    const a = { transaction_id: "A", location: { city: "Allentown", region: "PA" } };
    const b = { transaction_id: "B", location: { region: "PA", city: "Allentown" } };
    expect(computeContentFingerprint(a)).toBe(computeContentFingerprint(b));
  });

  it("returns a stable-looking hex digest", () => {
    const fp = computeContentFingerprint({ transaction_id: "A", amount: 1 });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles a non-object raw value without throwing", () => {
    expect(() => computeContentFingerprint(null)).not.toThrow();
    expect(() => computeContentFingerprint("not an object")).not.toThrow();
  });
});

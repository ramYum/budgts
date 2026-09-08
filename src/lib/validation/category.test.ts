import { describe, expect, it } from "vitest";
import { categoryFormSchema } from "./category";

const base = { name: "  Utilities  ", kind: "expense", color: "#8b5cf6" };

describe("categoryFormSchema", () => {
  it("trims the name and keeps a valid entry", () => {
    expect(categoryFormSchema.parse(base)).toEqual({
      name: "Utilities",
      kind: "expense",
      color: "#8b5cf6",
    });
  });

  it("defaults the colour when omitted", () => {
    const { color } = categoryFormSchema.parse({ name: "Gifts", kind: "expense" });
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("rejects an empty name", () => {
    expect(categoryFormSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(categoryFormSchema.safeParse({ ...base, name: "x".repeat(41) }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(categoryFormSchema.safeParse({ ...base, kind: "transfer" }).success).toBe(false);
  });

  it("rejects a malformed colour", () => {
    expect(categoryFormSchema.safeParse({ ...base, color: "purple" }).success).toBe(false);
  });
});

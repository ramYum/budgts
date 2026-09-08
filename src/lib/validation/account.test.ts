import { describe, expect, it } from "vitest";
import { accountFormSchema } from "./account";

describe("accountFormSchema", () => {
  it("accepts a valid account", () => {
    expect(accountFormSchema.parse({ name: " Everyday ", type: "checking" })).toEqual({
      name: "Everyday",
      type: "checking",
    });
  });

  it("rejects an empty name", () => {
    expect(accountFormSchema.safeParse({ name: "", type: "cash" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(accountFormSchema.safeParse({ name: "Wallet", type: "crypto" }).success).toBe(false);
  });
});

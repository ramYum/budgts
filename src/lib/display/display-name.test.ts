import { describe, expect, it } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
  it("takes the email handle up to its first separator, capitalised", () => {
    expect(displayName("alex@example.com")).toBe("Alex");
    expect(displayName("alex.lee+budgts@example.com")).toBe("Alex");
    expect(displayName("sam_o-k@example.com")).toBe("Sam");
  });

  it("is empty when there is no usable handle", () => {
    expect(displayName("")).toBe("");
    expect(displayName(null)).toBe("");
    expect(displayName("+tag@example.com")).toBe("");
  });
});

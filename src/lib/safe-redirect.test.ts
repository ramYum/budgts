import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

const BACKSLASH_HOST = "/" + String.fromCharCode(92) + "evil.com"; // "/\evil.com"

describe("safeNextPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeNextPath("/transactions?m=2026-09")).toBe("/transactions?m=2026-09");
  });

  it("falls back to / for empty or missing input", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("rejects protocol-relative //host", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
  });

  it("rejects a backslash-prefixed path", () => {
    expect(safeNextPath(BACKSLASH_HOST)).toBe("/");
  });

  it("rejects an absolute URL", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
  });
});

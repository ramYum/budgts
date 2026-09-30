import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCKED_MESSAGE } from "@/lib/ownership";

describe("the apps say what the web says when a deletion has paused changes", () => {
  it("mobile/lib/api/load.ts carries the web's LOCKED_MESSAGE verbatim", () => {
    const src = readFileSync(join(__dirname, "..", "..", "mobile", "lib", "api", "load.ts"), "utf8");
    expect(src).toContain(`export const LOCKED_MESSAGE = ${JSON.stringify(LOCKED_MESSAGE)};`);
  });
});

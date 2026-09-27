import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Server logs must never carry credentials, tokens or account detail. A Plaid
// SDK (axios) error holds the whole request (the PLAID-SECRET header, the
// access token in its body), and a DB error can quote the failing row, so on
// the server every console.error / console.warn passes either plain text or
// describePlaidError(...) (src/lib/plaid/error-policy.ts), never a raw error.
const ROOT = join(__dirname, "..", "..");
const DIRS = ["src/app/api", "src/server", "src/lib/plaid", "src/lib/db"].map((d) => join(ROOT, d));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("server error logs", () => {
  it("never pass a raw error object", () => {
    const offenders: string[] = [];
    for (const file of DIRS.flatMap(sourceFiles)) {
      const code = readFileSync(file, "utf8");
      for (const call of code.matchAll(/console\.(?:error|warn)\(([\s\S]*?)\);/g)) {
        const args = call[1]!;
        const plainText = /^\s*(["'`])[^"'`]*\1\s*,?\s*$/.test(args);
        if (plainText || args.includes("describePlaidError(")) continue;
        const line = code.slice(0, call.index).split("\n").length;
        offenders.push(`${relative(ROOT, file).split(sep).join("/")}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

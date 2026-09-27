import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Server logs must never carry credentials, tokens or row data. A Plaid SDK
// (axios) error holds the whole request (the PLAID-SECRET header, the access
// token in its body), and a database error holds the SQL and its parameters,
// so on the server an error only ever reaches a log through
// describePlaidError(...) (src/lib/plaid/error-policy.ts). This is a tripwire,
// not a proof: it reads each console call's arguments and fails on anything
// error-shaped outside describePlaidError.
const ROOT = join(__dirname, "..", "..");
const DIRS = ["src/app/api", "src/server", "src/lib"].map((d) => join(ROOT, d));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A console call's argument text, split at its top-level commas. */
function topLevelArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      args.push(text.slice(start, i));
      start = i + 1;
    }
  }
  args.push(text.slice(start));
  return args.map((a) => a.trim()).filter(Boolean);
}

const SAFE_CALL = /describePlaidError\((?:[^()]|\([^()]*\))*\)/g;
const ERROR_SHAPED = /\b(?:e|err|error|reason|cause)\b|\w+(?:Err|Error)\b|JSON\.stringify|String\(|\.stack\b|\.message\b/;

/** True when a log argument could carry a raw error. */
function unsafeArg(arg: string): boolean {
  if (/^(["'])[\s\S]*\1$/.test(arg)) return false;
  if (/^`[\s\S]*`$/.test(arg)) return arg.includes("${");
  return ERROR_SHAPED.test(arg.replace(SAFE_CALL, ""));
}

function unsafeCalls(code: string): number[] {
  const lines: number[] = [];
  for (const call of code.matchAll(/console\.(?:error|warn|log|info)\(([\s\S]*?)\);/g)) {
    if (topLevelArgs(call[1]!).some(unsafeArg)) lines.push(code.slice(0, call.index).split("\n").length);
  }
  return lines;
}

describe("server logs", () => {
  it("never pass a raw error", () => {
    const offenders = DIRS.flatMap(sourceFiles).flatMap((file) =>
      unsafeCalls(readFileSync(file, "utf8")).map((line) => `${relative(ROOT, file).split(sep).join("/")}:${line}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the tripwire catches the ways a raw error slips through", () => {
    for (const bad of [
      'console.error("x", e);',
      'console.error("x", { itemId, e });',
      "console.error(`failed ${JSON.stringify(err)}`);",
      'console.error("x", describePlaidError(e), e);',
      'console.warn("x", (e as Error).message);',
      'console.log("x", r.reason);',
      'console.info("x", acctErr);',
    ]) {
      expect(unsafeCalls(bad), bad).toHaveLength(1);
    }
    for (const good of [
      'console.error("x");',
      "console.error(`plain`);",
      'console.error("x", describePlaidError(e));',
      'console.error("x", { itemId: due[i].itemId, ...describePlaidError(r.reason) });',
      'console.log("[plaid] transfer-pairing", { userId, candidateCount: 3 });',
    ]) {
      expect(unsafeCalls(good), good).toHaveLength(0);
    }
  });
});

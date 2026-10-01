import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * UI copy never uses an em-dash (CLAUDE.md, the soft-pixel pass: "no em-dashes in UI copy"; the owner's rule). This
 * scans every string the user can be shown under the server's Plaid code, the server actions and the native app:
 * string literals, template literal text and JSX text, never comments. Test files are skipped (they may assert the
 * absence of the character).
 */
const ROOT = path.resolve(__dirname, "../..");
const SCOPES = ["src/lib/plaid", "src/server", "mobile/app", "mobile/components", "mobile/lib"];
const EM_DASH = "—";

/**
 * Known em-dashes, each with why it may stay. Keep this list short and commented: anything new belongs in a period or
 * a comma instead.
 */
const ALLOWED: { file: string; contains: string; why: string }[] = [
  {
    // developer-only: thrown at boot when an env var is missing, never shown in the app
    file: "src/lib/plaid/config.ts",
    contains: "is not set",
    why: "developer error",
  },
  {
    // stored in plaid_accounts.review_reason (shown on Connected banks) and matched by its marker substring
    // (ANOMALY_DUPLICATE_REASON_MARKER, sync-store clearReplayReviewFlag); existing rows keep the old text. Rewording it
    // is an owner decision (2026-10-01 device pass), not a copy fix.
    file: "src/lib/plaid/sync-engine.ts",
    contains: "this connection's data may be unreliable until reviewed",
    why: "stored review reason",
  },
  {
    // stored in plaid_accounts.review_reason (shown on Connected banks); see above
    file: "src/lib/plaid/sync-engine.ts",
    contains: "some data may be miscategorized until reviewed",
    why: "stored review reason",
  },
];

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(abs, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(path.join(dir, name)));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(path.join(dir, name));
  }
  return out;
}

/** Every piece of copy in a file that holds an em-dash: literal text only, so comments never count. */
function emDashCopy(fileName: string, text: string): string[] {
  const src = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (node.text.includes(EM_DASH)) found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return found;
}

describe("UI copy has no em-dash", () => {
  it("finds an em-dash in strings, templates and JSX text, never in comments", () => {
    const sample = [
      `// a comment ${EM_DASH} fine`,
      `const a = "one ${EM_DASH} two";`,
      "const b = `x ${y} " + EM_DASH + " z`;",
      `const c = <p>Hi ${EM_DASH} there</p>;`,
    ].join("\n");
    expect(emDashCopy("x.tsx", sample)).toHaveLength(3);
  });

  it("has none under src/lib/plaid, src/server and the native app, bar the commented allow-list", () => {
    const offenders: string[] = [];
    const used = new Set<number>();
    for (const scope of SCOPES) {
      for (const file of sourceFiles(scope)) {
        const rel = file.split(path.sep).join("/");
        for (const copy of emDashCopy(rel, readFileSync(path.join(ROOT, file), "utf8"))) {
          const allowed = ALLOWED.findIndex((a) => a.file === rel && copy.includes(a.contains));
          if (allowed >= 0) used.add(allowed);
          else offenders.push(`${rel}: ${copy.trim().slice(0, 100)}`);
        }
      }
    }
    expect(offenders, "UI copy uses a period or a comma, never an em-dash (U+2014)").toEqual([]);
    // an allow-list entry whose string is gone is stale: remove it
    expect(ALLOWED.filter((_, i) => !used.has(i)).map((a) => `${a.file}: ${a.contains}`)).toEqual([]);
  });
});

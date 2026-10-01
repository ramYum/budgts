import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Transform origins React Native can read (the 2026-10-01 Crystal fix): RN parses a string origin with /\d+px/, so a
 * computed "54.00000000000001px" read as 1px and Crystal turned about her left edge. A computed origin is written only
 * with `pxOrigin(x, y)` (lib/motion/css.ts), which hands RN numbers. This scan fails on:
 * - a `transformOrigin:` / `origin:` value built as a template literal or with `+`;
 * - a string origin outside `left|right|top|bottom|center|N%`, one or two of them;
 * - a `${…}px` or `${…}%` template as a style value (any property value; keyframe keys are not values).
 *
 * Out of scope by construction, and safe:
 * - tour/guide-keyframes.ts `rotate: \`${r}deg\``: a whole number of degrees, which RN reads with parseFloat (no px, no %);
 * - brand/egg-loader.tsx `\`${(…).toFixed(4)}%\``: a keyframe offset KEY (a computed property name), never a style value.
 */
const ROOT = join(__dirname, "..");
const KEYWORD = "(top|bottom|left|right|center|\\d+%)";
const ORIGIN_STRING = new RegExp(`^${KEYWORD}( ${KEYWORD})?$`);
const HINT = "write a computed transform origin with pxOrigin(x, y) from lib/motion/css.ts, never a string";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, path).split("\\").join("/")] : [];
  });
}

const propName = (p: ts.PropertyAssignment): string | null =>
  ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;

/** A template whose substitution is followed by px or % (`${x}px`, `${y}%`). */
const unitTemplate = (n: ts.Node): boolean =>
  ts.isTemplateExpression(n) && n.templateSpans.some((s) => /^(px|%)/.test(s.literal.text));

/** Why an origin value can't be trusted, or null. Conditionals are checked branch by branch; other expressions
 * (pxOrigin(...), a typed array) are the type checker's to police. */
function originProblem(v: ts.Expression): string | null {
  if (ts.isParenthesizedExpression(v)) return originProblem(v.expression);
  if (ts.isConditionalExpression(v)) return originProblem(v.whenTrue) ?? originProblem(v.whenFalse);
  if (ts.isTemplateExpression(v)) return "a template-literal origin";
  if (ts.isBinaryExpression(v) && v.operatorToken.kind === ts.SyntaxKind.PlusToken) return "an origin built with +";
  if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
    return ORIGIN_STRING.test(v.text) ? null : `the string origin "${v.text}"`;
  }
  return null;
}

/** Every unsafe origin or unit template in a source file, as "line: problem". */
function originFindings(fileName: string, text: string): string[] {
  const src = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const at = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propName(node);
      if (name === "transformOrigin" || name === "origin") {
        const problem = originProblem(node.initializer);
        if (problem) found.push(`${fileName}:${at(node)}: ${problem}`);
      } else if (unitTemplate(node.initializer)) {
        found.push(`${fileName}:${at(node)}: a \${…}px / \${…}% template as the style value "${name ?? "?"}"`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return found;
}

describe("transform origins RN reads as written", () => {
  it("catches computed string origins and unit templates, and passes pxOrigin and keyword origins", () => {
    const bad = [
      "const a = { transformOrigin: `${FEET}px 50%` };",
      'const b = { origin: x + "px 50%" };',
      'const c = { transformOrigin: "54.00000000000001px 50%" };',
      "const d = { transformOrigin: on ? `${x}px 0` : \"center\" };",
      "const e = { width: `${w}px` };",
    ].join("\n");
    expect(originFindings("fixture.tsx", bad)).toHaveLength(5);
    const good = [
      'const a = { transformOrigin: pxOrigin(FEET, "50%") };',
      'const b = { transformOrigin: "50% 100%" };',
      'const c = { transformOrigin: side ? "bottom right" : "top right" };',
      "const d = { rotate: `${r}deg` };", // degrees: parseFloat reads them whole
      "const e = { [`${(k / 3).toFixed(4)}%`]: { opacity: 1 } };", // a keyframe key, not a value
      "const f = <Text>{`${share}%`}</Text>;", // copy, not a style
    ].join("\n");
    expect(originFindings("fixture.tsx", good)).toEqual([]);
  });

  it("finds none in the app", () => {
    const findings = ["app", "components", "lib"]
      .flatMap((d) => sources(join(ROOT, d)))
      .flatMap((f) => originFindings(f, readFileSync(join(ROOT, f), "utf8")));
    expect(findings, HINT).toEqual([]);
  });
});

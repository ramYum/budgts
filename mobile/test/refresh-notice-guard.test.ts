import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The pull contract (docs/superpowers/plans/2026-09-30-phase3-native-screens.md): a reload that fails keeps the
 * figures on screen and sets `useResource`'s `notice`. A screen that doesn't draw it shows stale figures as current.
 * The shells draw it in one place (`<Screen notice onRetry name>`, `<StandaloneShell …>`), so the rule is static:
 * every route under app/ that calls `useResource`, or a hook built on it, itself or in a view it imports from
 * components/, passes `notice` to every shell it renders. A `useResource` call that can never set `notice` (no
 * options argument and no `refresh` taken: the first load and Try again only) needs none. Nothing is allow-listed.
 * Read with the TypeScript parser, so formatting can't fool it.
 */
const ROOT = join(__dirname, "..");
const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;
const SHELLS = new Set(["Screen", "StandaloneShell"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return SOURCE.test(name) && !TEST.test(name) ? [path] : [];
  });
}

const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
const parsed = new Map<string, ts.SourceFile>();
function parse(path: string): ts.SourceFile {
  let file = parsed.get(path);
  if (!file) {
    file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    parsed.set(path, file);
  }
  return file;
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

const calleeName = (call: ts.CallExpression) => (ts.isIdentifier(call.expression) ? call.expression.text : null);

/** Every `use*` call under a node. */
function hookCalls(node: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  walk(node, (n) => {
    if (ts.isCallExpression(n) && calleeName(n)?.startsWith("use")) calls.push(n);
  });
  return calls;
}

/** The exported `use*` functions of a file, with their bodies. */
function exportedHooks(file: ts.SourceFile): { name: string; body: ts.Block }[] {
  return file.statements.flatMap((s) =>
    ts.isFunctionDeclaration(s) && s.name?.text.startsWith("use") && s.body && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ? [{ name: s.name.text, body: s.body }]
      : [],
  );
}

/** `useResource` and every exported `use*` hook in lib/ or components/ that calls one of them (to a fixpoint). */
function resourceHooks(files: string[]): Set<string> {
  const hooks = new Set(["useResource"]);
  const defs = files.flatMap((f) => exportedHooks(parse(f)));
  for (let grew = true; grew; ) {
    grew = false;
    for (const { name, body } of defs) {
      if (!hooks.has(name) && hookCalls(body).some((c) => hooks.has(calleeName(c)!))) {
        hooks.add(name);
        grew = true;
      }
    }
  }
  return hooks;
}

/** Whether a variable's `refresh` is read anywhere in the file (`x.refresh`). */
function readsRefresh(file: ts.SourceFile, variable: string): boolean {
  let found = false;
  walk(file, (n) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === variable && n.name.text === "refresh") found = true;
  });
  return found;
}

/**
 * The calls in a file that can ever set `notice`. Every hook built on `useResource` can. A direct `useResource` call
 * can when it passes options (a `version`: silent reloads) or its result's `refresh` is taken (a pull).
 */
function callsThatCanNotice(path: string, hooks: Set<string>): string[] {
  const file = parse(path);
  return hookCalls(file)
    .filter((call) => {
      const name = calleeName(call)!;
      if (!hooks.has(name)) return false;
      if (name !== "useResource") return true;
      if (call.arguments.length > 2) return true;
      const decl = call.parent;
      if (!ts.isVariableDeclaration(decl)) return true; // used some other way: assume it can
      if (ts.isObjectBindingPattern(decl.name)) {
        return decl.name.elements.some((e) => ((e.propertyName ?? e.name) as ts.Identifier).text === "refresh" || !!e.dotDotDotToken);
      }
      return ts.isIdentifier(decl.name) ? readsRefresh(file, decl.name.text) : true;
    })
    .map((call) => `${calleeName(call)} in ${rel(path)}`);
}

/** The components/ files a route imports directly (its views). */
function views(route: string): string[] {
  return parse(route)
    .statements.filter(ts.isImportDeclaration)
    .map((i) => (i.moduleSpecifier as ts.StringLiteral).text)
    .filter((spec) => spec.startsWith("."))
    .flatMap((spec) => {
      const base = resolve(dirname(route), spec);
      return [`${base}.tsx`, `${base}.ts`].filter(existsSync);
    })
    .filter((f) => rel(f).startsWith("components/"));
}

/** Every `<Screen …>` / `<StandaloneShell …>` a file renders, with the names of the props it passes. */
function shells(path: string): { tag: string; props: string[] }[] {
  const found: { tag: string; props: string[] }[] = [];
  walk(parse(path), (n) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName) && SHELLS.has(n.tagName.text)) {
      found.push({
        tag: n.tagName.text,
        props: n.attributes.properties.flatMap((p) => (ts.isJsxAttribute(p) ? [p.name.getText()] : ["..."])),
      });
    }
  });
  return found;
}

describe("every useResource screen shows its stale-data notice, from its shell", () => {
  const all = ["app", "components", "lib"].flatMap((d) => sources(join(ROOT, d)));
  const hooks = resourceHooks(all.filter((f) => !rel(f).startsWith("app/")));
  const routes = all.filter((f) => rel(f).startsWith("app/") && f.endsWith(".tsx"));

  it("finds the hooks built on useResource (the scan isn't vacuous)", () => {
    for (const h of ["useHome", "useHub", "useCategoriesScreen", "useActivityPanels"]) expect(hooks).toContain(h);
  });

  it("each such route passes `notice` to every shell it renders", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const route of routes) {
      const calls = [route, ...views(route)].flatMap((f) => callsThatCanNotice(f, hooks));
      if (calls.length === 0) continue;
      checked++;
      const rendered = shells(route);
      if (rendered.length === 0) problems.push(`${rel(route)}: ${calls.join(", ")}, but renders no Screen or StandaloneShell`);
      for (const s of rendered) if (!s.props.includes("notice")) problems.push(`${rel(route)}: <${s.tag}> without notice (${calls.join(", ")})`);
    }
    expect(problems).toEqual([]);
    // Home, Activity, Budgets, Goals, Insights, Accounts, Connected banks, Categories, Delete account, More, Settings
    expect(checked).toBeGreaterThanOrEqual(11);
  });

  it("a hook built on useResource hands `notice` on", () => {
    const dropped = all
      .filter((f) => !rel(f).startsWith("app/"))
      .flatMap((f) => exportedHooks(parse(f)).map((h) => ({ ...h, f })))
      .filter(({ name }) => name !== "useResource" && hooks.has(name))
      .filter(({ body }) => {
        const text = body.getText();
        // names `notice`, or returns (whole, spread or as a field) a resource or a variable holding one
        if (/\bnotice\b/.test(text)) return false;
        const held = new Set<string>();
        let handsOn = false;
        walk(body, (n) => {
          if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isCallExpression(n.initializer) && hooks.has(calleeName(n.initializer) ?? "")) {
            held.add(n.name.text);
          }
        });
        walk(body, (n) => {
          if (!ts.isReturnStatement(n) || !n.expression) return;
          if (ts.isCallExpression(n.expression) && hooks.has(calleeName(n.expression) ?? "")) handsOn = true;
          walk(n.expression, (e) => {
            if (ts.isIdentifier(e) && held.has(e.text)) handsOn = true;
          });
        });
        return !handsOn;
      })
      .map(({ name, f }) => `${name} in ${rel(f)}`);
    expect(dropped).toEqual([]);
  });
});

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The pull contract (docs/superpowers/plans/2026-09-30-phase3-native-screens.md): a reload that fails keeps the
 * figures on screen and sets `useResource`'s `notice`. A screen that doesn't draw it shows stale figures as current.
 * The shells draw it in one place (`<Screen notice onRetry name>`, `<StandaloneShell …>`), so the rule is static:
 * every route under app/ that calls `useResource`, or a hook built on it, itself or in a view it reaches through
 * components/ imports, passes `notice` to every shell it renders. A `useResource` call that can never set `notice` (no
 * options argument and no `refresh` taken: the first load and Try again only) needs none. A view's own reads (a
 * sheet's lists) must read their `notice` too, and a hook built on `useResource` must hand it on. A route never passes
 * a literal `notice={null}` / `notice={undefined}` (that silences the shell). Nothing is allow-listed.
 * Read with the TypeScript parser, so formatting can't fool it; each rule is also proven on fixtures below.
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
/** Fixture files (path → source), read before the disk, so each rule can be shown failing. */
const virtual = new Map<string, string>();
const exists = (path: string) => virtual.has(path) || existsSync(path);
const parsed = new Map<string, ts.SourceFile>();
function parse(path: string): ts.SourceFile {
  let file = parsed.get(path);
  if (!file) {
    const text = virtual.get(path) ?? readFileSync(path, "utf8");
    file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
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

const exported = (s: ts.Statement) =>
  !!(ts.canHaveModifiers(s) ? ts.getModifiers(s) : undefined)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/**
 * The exported `use*` hooks of a file, with their bodies: `export function useX() {…}` and
 * `export const useX = (…) => …` / `= function (…) {…}` (a concise arrow's body is the expression it returns).
 */
function exportedHooks(file: ts.SourceFile): { name: string; body: ts.ConciseBody }[] {
  return file.statements.flatMap((s) => {
    if (!exported(s)) return [];
    if (ts.isFunctionDeclaration(s)) return s.name?.text.startsWith("use") && s.body ? [{ name: s.name.text, body: s.body }] : [];
    if (!ts.isVariableStatement(s)) return [];
    return s.declarationList.declarations.flatMap((d) =>
      ts.isIdentifier(d.name) && d.name.text.startsWith("use") && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ? [{ name: d.name.text, body: d.initializer.body }]
        : [],
    );
  });
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
 * Whether a call can ever set `notice`. Every hook built on `useResource` can. A direct `useResource` call can when it
 * passes options (a `version`: silent reloads) or its result's `refresh` is taken (a pull).
 */
function canNotice(file: ts.SourceFile, call: ts.CallExpression, hooks: Set<string>): boolean {
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
}

function callsThatCanNotice(path: string, hooks: Set<string>): string[] {
  const file = parse(path);
  return hookCalls(file)
    .filter((call) => canNotice(file, call, hooks))
    .map((call) => `${calleeName(call)} in ${rel(path)}`);
}

/** The components/ files a file imports directly. */
function componentImports(from: string): string[] {
  return parse(from)
    .statements.filter(ts.isImportDeclaration)
    .map((i) => (i.moduleSpecifier as ts.StringLiteral).text)
    .filter((spec) => spec.startsWith("."))
    .flatMap((spec) => {
      const base = resolve(dirname(from), spec);
      return [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")].filter(exists).slice(0, 1);
    })
    .filter((f) => rel(f).startsWith("components/"));
}

/** Every components/ file a route reaches through components/ imports (its views, and theirs), each once. */
function views(route: string): string[] {
  const seen = new Set<string>();
  const queue = componentImports(route);
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...componentImports(f));
  }
  return [...seen];
}

/** `notice={null}` / `notice={undefined}`: a literal that silences the shell's notice. */
function silenced(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return false;
  const e = init.expression;
  return e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === "undefined");
}

/** Every `<Screen …>` / `<StandaloneShell …>` a file renders: the props it passes, and whether its notice is silenced. */
function shells(path: string): { tag: string; props: string[]; silenced: boolean }[] {
  const found: { tag: string; props: string[]; silenced: boolean }[] = [];
  walk(parse(path), (n) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName) && SHELLS.has(n.tagName.text)) {
      const attrs = n.attributes.properties;
      found.push({
        tag: n.tagName.text,
        props: attrs.flatMap((p) => (ts.isJsxAttribute(p) ? [p.name.getText()] : ["..."])),
        silenced: attrs.some((p) => ts.isJsxAttribute(p) && p.name.getText() === "notice" && silenced(p)),
      });
    }
  });
  return found;
}

/** Rule 1: a route that can get a notice passes it to every shell; no route passes a literal null / undefined one. */
function routeProblems(routes: string[], hooks: Set<string>): { problems: string[]; checked: number } {
  const problems: string[] = [];
  let checked = 0;
  for (const route of routes) {
    const rendered = shells(route);
    for (const s of rendered) if (s.silenced) problems.push(`${rel(route)}: <${s.tag}> with a literal null/undefined notice`);
    const calls = [route, ...views(route)].flatMap((f) => callsThatCanNotice(f, hooks));
    if (calls.length === 0) continue;
    checked++;
    if (rendered.length === 0) problems.push(`${rel(route)}: ${calls.join(", ")}, but renders no Screen or StandaloneShell`);
    for (const s of rendered) if (!s.props.includes("notice")) problems.push(`${rel(route)}: <${s.tag}> without notice (${calls.join(", ")})`);
  }
  return { problems, checked };
}

/** Rule 2: a screen or view reads the `notice` of every `useResource` it calls that can set one. */
function unreadNotices(files: string[], hooks: Set<string>): string[] {
  return files.flatMap((f) => {
    const file = parse(f);
    return hookCalls(file)
      .filter((call) => calleeName(call) === "useResource" && canNotice(file, call, hooks))
      .filter((call) => {
        const decl = call.parent;
        if (!ts.isVariableDeclaration(decl)) return true;
        if (ts.isObjectBindingPattern(decl.name)) {
          return !decl.name.elements.some((e) => ((e.propertyName ?? e.name) as ts.Identifier).text === "notice" || !!e.dotDotDotToken);
        }
        if (!ts.isIdentifier(decl.name)) return true;
        const name = decl.name.text;
        let reads = false;
        walk(file, (n) => {
          if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name && n.name.text === "notice") reads = true;
        });
        return !reads;
      })
      .map((call) => `${rel(f)}:${file.getLineAndCharacterOfPosition(call.getStart()).line + 1}`);
  });
}

/** Rule 3: a hook built on `useResource` hands `notice` on. */
function droppedNotices(files: string[], hooks: Set<string>): string[] {
  return files
    .flatMap((f) => exportedHooks(parse(f)).map((h) => ({ ...h, f })))
    .filter(({ name }) => name !== "useResource" && hooks.has(name))
    .filter(({ body }) => {
      // names `notice`, or returns (whole, spread or as a field) a resource or a variable holding one
      if (/\bnotice\b/.test(body.getText())) return false;
      const held = new Set<string>();
      walk(body, (n) => {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isCallExpression(n.initializer) && hooks.has(calleeName(n.initializer) ?? "")) {
          held.add(n.name.text);
        }
      });
      // a concise arrow returns its body
      const returned: ts.Expression[] = ts.isBlock(body) ? [] : [body];
      walk(body, (n) => {
        if (ts.isReturnStatement(n) && n.expression) returned.push(n.expression);
      });
      let handsOn = false;
      for (const r of returned) {
        if (ts.isCallExpression(r) && hooks.has(calleeName(r) ?? "")) handsOn = true;
        walk(r, (e) => {
          if (ts.isIdentifier(e) && held.has(e.text)) handsOn = true;
        });
      }
      return !handsOn;
    })
    .map(({ name, f }) => `${name} in ${rel(f)}`);
}

describe("every useResource screen shows its stale-data notice, from its shell", () => {
  const all = ["app", "components", "lib"].flatMap((d) => sources(join(ROOT, d)));
  const hooks = resourceHooks(all.filter((f) => !rel(f).startsWith("app/")));
  const routes = all.filter((f) => rel(f).startsWith("app/") && f.endsWith(".tsx"));

  it("finds the hooks built on useResource (the scan isn't vacuous)", () => {
    for (const h of ["useHome", "useHub", "useCategoriesScreen", "useActivityPanels"]) expect(hooks).toContain(h);
  });

  it("each such route passes `notice` to every shell it renders, never a literal null or undefined", () => {
    const { problems, checked } = routeProblems(routes, hooks);
    expect(problems).toEqual([]);
    // Home, Activity, Budgets, Goals, Insights, Accounts, Connected banks, Categories, Delete account, More, Settings
    expect(checked).toBeGreaterThanOrEqual(11);
  });

  it("a screen or view reads the `notice` of every useResource it calls that can set one (a sheet's lists too)", () => {
    expect(unreadNotices(all.filter((f) => rel(f).startsWith("app/") || rel(f).startsWith("components/")), hooks)).toEqual([]);
  });

  it("a hook built on useResource hands `notice` on", () => {
    expect(droppedNotices(all.filter((f) => !rel(f).startsWith("app/")), hooks)).toEqual([]);
  });
});

describe("the guard's rules, proven on fixtures (each fails, then passes)", () => {
  const fixture = (files: Record<string, string>) => {
    virtual.clear();
    parsed.clear();
    for (const [path, text] of Object.entries(files)) virtual.set(join(ROOT, path), text);
    return Object.keys(files).map((f) => join(ROOT, f));
  };
  const only = new Set(["useResource"]);

  it("finds `export const useX = () => …` and `= function () {…}` hooks, and one built on them, and checks they hand `notice` on", () => {
    const files = {
      "lib/__fx__/arrow.ts": `export const useFx = () => useResource("k", f, { version: 1 });`,
      "lib/__fx__/fn.ts": `export const useFxFn = function () { const { state } = useResource("k", f, { version: 1 }); return state; };`,
      "lib/__fx__/top.ts": `export const useFxTop = () => { const r = useFx(); return { data: 1 }; };`,
    };
    const paths = fixture(files);
    const hooks = resourceHooks(paths);
    expect([...hooks]).toEqual(expect.arrayContaining(["useFx", "useFxFn", "useFxTop"]));
    // the concise arrow returns the resource itself: handed on; the other two drop it
    expect(droppedNotices(paths, hooks)).toEqual(["useFxFn in lib/__fx__/fn.ts", "useFxTop in lib/__fx__/top.ts"]);
    const fixed = fixture({
      ...files,
      "lib/__fx__/fn.ts": `export const useFxFn = function () { const { state, notice } = useResource("k", f, { version: 1 }); return { state, notice }; };`,
      "lib/__fx__/top.ts": `export const useFxTop = () => { const r = useFx(); return r; };`,
    });
    expect(droppedNotices(fixed, resourceHooks(fixed))).toEqual([]);
  });

  it("follows a route's views through components/ imports, at any depth, a cycle included", () => {
    const files = {
      "app/__fx__/route.tsx": `import { View } from "../../components/__fx__/view";\nexport default () => <Screen><View /></Screen>;`,
      "components/__fx__/view.tsx": `import { Inner } from "./inner";\nexport const View = () => <Inner />;`,
      "components/__fx__/inner.tsx": `import { View } from "./view";\nexport const Inner = () => { const r = useResource("k", f, { version: 1 }); return r.notice; };`,
    };
    const [route] = fixture(files);
    expect(routeProblems([route!], only).problems).toEqual(["app/__fx__/route.tsx: <Screen> without notice (useResource in components/__fx__/inner.tsx)"]);
    const [fixedRoute] = fixture({
      ...files,
      "app/__fx__/route.tsx": files["app/__fx__/route.tsx"].replace("<Screen>", `<Screen name="fx" notice={n} onRetry={r}>`),
    });
    expect(routeProblems([fixedRoute!], only).problems).toEqual([]);
  });

  it("rejects a literal notice={null} or notice={undefined} in a route, not a conditional", () => {
    for (const literal of ["null", "undefined"]) {
      const [route] = fixture({ "app/__fx__/route.tsx": `export default () => <Screen name="fx" notice={${literal}} onRetry={r} />;` });
      expect(routeProblems([route!], only).problems).toEqual(["app/__fx__/route.tsx: <Screen> with a literal null/undefined notice"]);
    }
    const [route] = fixture({ "app/__fx__/route.tsx": `export default () => <Screen name="fx" notice={ready ? n : null} onRetry={r} />;` });
    expect(routeProblems([route!], only).problems).toEqual([]);
  });

  it("a view's own read whose notice is never used fails, then passes once read", () => {
    const [view] = fixture({ "components/__fx__/sheet.tsx": `export const S = () => { const a = useResource("k", f, { version: 1 }); return a.state; };` });
    expect(unreadNotices([view!], only)).toEqual(["components/__fx__/sheet.tsx:1"]);
    const [read] = fixture({ "components/__fx__/sheet.tsx": `export const S = () => { const a = useResource("k", f, { version: 1 }); return [a.state, a.notice]; };` });
    expect(unreadNotices([read!], only)).toEqual([]);
  });
});

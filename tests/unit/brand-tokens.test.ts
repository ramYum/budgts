import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLOR,
  DOGICA_WORD_SPACING_EM,
  FONT,
  FONT_FILES,
  MOTION,
  RAISE,
  ROLE,
  SHADOW,
  SPACE,
  TYPE,
  shadowCss,
  type TypeRoleName,
} from "@/lib/brand/tokens";
import { CELL, FRAMES } from "@/lib/brand/pixel-frame";

/**
 * src/lib/brand/tokens.ts is the one source of the look for the web and the
 * native apps; the web paints with globals.css. This keeps the two equal:
 * change a value in one and this fails until the other matches.
 */

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const css = read("src/app/globals.css");

const kebab = (key: string) => key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();

/** The :root custom properties, `var()` references resolved. */
function rootVars(): Map<string, string> {
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("\n}", start));
  const raw = new Map<string, string>();
  for (const m of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+):\s*([^;]+);/g)) raw.set(m[1]!, m[2]!.trim());
  const resolve = (v: string): string => v.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolve(raw.get(name) ?? `?${name}`));
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}

/** Drop `@media (...) { … }` blocks (the md+ values), keeping the phone rules. */
function withoutMedia(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@media", i);
    if (at < 0) return out + text.slice(i);
    out += text.slice(i, at);
    let depth = 0;
    let j = text.indexOf("{", at);
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

/** Declarations of every innermost rule, merged per class in source order. */
function classDecls(): Map<string, Record<string, string>> {
  const text = withoutMedia(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  const out = new Map<string, Record<string, string>>();
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Record<string, string> = {};
    for (const d of m[2]!.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) decls[d[1]!] = d[2]!.trim();
    for (const sel of m[1]!.split(",").map((s) => s.trim())) {
      if (!/^\.[\w-]+$/.test(sel)) continue;
      out.set(sel, { ...out.get(sel), ...decls });
    }
  }
  return out;
}

const ROLE_CLASS: Partial<Record<TypeRoleName, string>> = {
  pxTitle: ".px-title",
  pxFigure: ".px-figure",
  pxFigureLg: ".px-figure-lg",
  pxTag: ".px-tag",
  pxTagBold: ".px-tag-bold",
  pxLabel: ".px-label",
  tNumXl: ".t-num-xl",
  tNumLg: ".t-num-lg",
  tNum: ".t-num",
  tHead: ".t-head",
  tLabel: ".t-label",
  tLabelStrong: ".t-label-strong",
};

const FACE_VAR = { geist: "--font-geist", geistMono: "--font-geist-mono", dogicaBold: "--font-dogica-bold", dogicaPixel: "--font-dogica-pixel" } as const;

describe("brand tokens (src/lib/brand/tokens.ts) match globals.css", () => {
  const vars = rootVars();

  it("every raw color", () => {
    for (const [key, hex] of Object.entries(COLOR)) {
      expect(vars.get(`--${kebab(key)}`), `--${kebab(key)}`).toBe(hex);
    }
  });

  it("every semantic role", () => {
    for (const [key, hex] of Object.entries(ROLE)) {
      expect(vars.get(`--${kebab(key)}`), `--${kebab(key)}`).toBe(hex);
    }
  });

  it("globals.css defines no color the tokens miss", () => {
    const known = new Set([...Object.keys(COLOR), ...Object.keys(ROLE)].map((k) => `--${kebab(k)}`));
    const colors = [...vars].filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).map(([k]) => k);
    // --background / --foreground are Tailwind's aliases of --bg / --text
    expect(colors.filter((k) => !known.has(k) && k !== "--background" && k !== "--foreground")).toEqual([]);
  });

  it("listNameLg is the web's text-base font-medium (a bank card's name), a reading style set with utilities", () => {
    expect(TYPE.listNameLg).toEqual({ face: "geist", weight: 500, size: 16, lineHeight: 24, tracking: { px: 0 } });
  });

  it("every type role at phone width", () => {
    const rules = classDecls();
    for (const [name, cls] of Object.entries(ROLE_CLASS) as [TypeRoleName, string][]) {
      const role = TYPE[name];
      const d = rules.get(cls);
      expect(d, cls).toBeDefined();
      const family = d!["font-family"];
      if (role.face === "geist") expect(family === undefined || family.startsWith("var(--font-geist)"), `${cls} face`).toBe(true);
      else expect(family, `${cls} face`).toMatch(new RegExp(`^var\\(${FACE_VAR[role.face]}\\)`));
      expect(d!["font-size"], `${cls} size`).toBe(`${role.size}px`);
      expect(d!["line-height"], `${cls} line-height`).toBe(`${role.lineHeight}px`);
      const tracking = "em" in role.tracking ? `${role.tracking.em}em` : role.tracking.px === 0 ? "0" : `${role.tracking.px}px`;
      expect(d!["letter-spacing"], `${cls} tracking`).toBe(tracking);
      expect(d!["font-weight"], `${cls} weight`).toBe(String("weight" in role ? role.weight : 400));
      expect(d!["text-transform"] === "uppercase", `${cls} uppercase`).toBe("uppercase" in role && role.uppercase === true);
      expect(d!["font-variant-numeric"] === "tabular-nums", `${cls} tabular`).toBe("tabular" in role && role.tabular === true);
      if (role.face === "dogicaBold" || role.face === "dogicaPixel") expect(d!["word-spacing"], `${cls} word-spacing`).toBe(`${DOGICA_WORD_SPACING_EM}em`);
    }
  });

  it("the shadows and the primary button's raised edge", () => {
    expect(shadowCss(SHADOW.card)).toBe(vars.get("--shadow-card"));
    expect(shadowCss(SHADOW.raised)).toBe(vars.get("--shadow-raised"));
    expect(css).toMatch(/\.px-card \{\s*box-shadow: var\(--shadow-card\);/);
    expect(css).toMatch(/\.px-card-raised \{\s*box-shadow: var\(--shadow-raised\);/);
    expect(css).toContain(`filter: drop-shadow(0 ${RAISE.y}px 0 var(--signal-edge));`);
    expect(RAISE.color).toBe(COLOR.signalEdge);
  });

  it("the motion timings", () => {
    expect(vars.get("--ease-out")).toBe(`cubic-bezier(${MOTION.easeOut.join(", ")})`);
    for (const line of [
      `page-enter ${MOTION.pageEnterMs}ms var(--ease-out)`,
      `rise-in ${MOTION.riseInMs}ms var(--ease-out)`,
      `calc(var(--i, 0) * ${MOTION.revealStepMs}ms + ${MOTION.revealBaseMs}ms)`,
      `cells-sweep ${MOTION.cellsSweepMs}ms linear`,
      `calc(var(--start, 0) * ${MOTION.cellStepMs}ms + 300ms)`,
      `robin-blink ${MOTION.robinBlinkMs / 1000}s linear infinite`,
      `var(--robin-chirp, ${MOTION.robinChirpMs / 1000}s)`,
      `robin-flicker ${MOTION.robinFlickerMs / 1000}s`,
      `robin-hop ${MOTION.robinHopMs}ms`,
    ]) {
      expect(css, line).toContain(line);
    }
    expect(css).toMatch(new RegExp(`\\.press:active \\{\\s*transform: scale\\(${MOTION.pressScale}\\);`));
  });
});

describe("brand tokens match the web's layout", () => {
  const ui = read("src/components/ui.tsx");

  it("button, field and tile sizes", () => {
    expect(ui).toContain('md: "h-9 '); // 36px
    expect(SPACE.buttonMd).toBe(36);
    expect(ui).toContain('lg: "h-11 '); // 44px
    expect(SPACE.buttonLg).toBe(44);
    // a field: its 3-cell frame each side, py-1, a 24px line
    const field = FRAMES.find((f) => f.name === "px-field")!;
    expect(ui).toMatch(/fieldClass =\s*"px-field w-full bg-transparent px-2 py-1 text-base leading-6/);
    expect(2 * field.k * CELL + 2 * 4 + 24).toBe(SPACE.field);
    expect(ui).toContain("h-8 w-8 md:h-10 md:w-10"); // tiles 32px on a phone
    expect(SPACE.tile).toBe(32);
  });

  it("the page gutter", () => {
    expect(read("src/components/standalone-shell.tsx")).toContain("px-6"); // 24px
    expect(read("src/app/(auth)/layout.tsx")).toContain("px-6");
    expect(SPACE.gutter).toBe(24);
  });
});

describe("brand fonts", () => {
  it("every family is a committed font file", () => {
    const families = [...Object.values(FONT.geist), FONT.geistMono, FONT.dogicaBold, FONT.dogicaPixel];
    expect(Object.keys(FONT_FILES).sort()).toEqual([...families].sort());
    for (const file of Object.values(FONT_FILES)) expect(existsSync(join(root, file)), file).toBe(true);
  });

  it("the web loads the same Dogica files", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain(`"./fonts/dogica/dogicabold.ttf"`);
    expect(layout).toContain(`"./fonts/dogica/dogicapixel.ttf"`);
  });
});

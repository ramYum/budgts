import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FONT, FONT_FILES, ICONS, ROBIN_ART, ROBIN_H, ROBIN_W, SHADOW, TYPE } from "./shared";
import { robinLayer, robinSize } from "./robin-paths";
import { pathPoints, snap, snapPath } from "./snap";
import { familyOf, isPixelRole, nativeShadow, pixelSpaceLetterSpacing, splitSpaces, textStyle } from "./type";

const mobileRoot = join(__dirname, "..", "..");

describe("snapping to device pixels", () => {
  it("reads a Pixelarticons path as absolute corner points", () => {
    expect(pathPoints("M4 2h2v20H4z")).toEqual([[[4, 2], [6, 2], [6, 22], [4, 22]]]);
    // a relative move after a close starts from the closed subpath's start
    expect(pathPoints("M2 10h4v4H2zm8 0h4v4h-4z")[1]).toEqual([[10, 10], [14, 10], [14, 14], [10, 14]]);
  });

  it("rounds to the nearest device pixel, as crispEdges does", () => {
    expect(snap(2, 2.625)).toBeCloseTo(5 / 2.625, 3); // 5.25 device px → 5
    expect(snap(4, 2.625)).toBeCloseTo(10 / 2.625, 3); // 10.5 → 10: a tie paints the top-left side
    expect(snap(3, 1)).toBe(3);
    expect(snap(-8, 2.625)).toBeCloseTo(-21 / 2.625, 9);
  });

  it("keeps every icon's corners on the device grid at every size", () => {
    for (const size of [12, 24, 36, 48]) {
      for (const d of ICONS.budgets.d) {
        for (const shape of pathPoints(snapPath(d, { unit: size / 24, ratio: 2.625 }))) {
          for (const [x, y] of shape) {
            expect(Math.abs(x * 2.625 - Math.round(x * 2.625))).toBeLessThan(1e-9);
            expect(Math.abs(y * 2.625 - Math.round(y * 2.625))).toBeLessThan(1e-9);
          }
        }
      }
    }
  });

  it("changes nothing at 1x on a whole grid", () => {
    expect(pathPoints(snapPath("M4 2h2v20H4z", { unit: 1, ratio: 1 }))).toEqual(pathPoints("M4 2h2v20H4z"));
  });
});

describe("Crystal", () => {
  it("draws at whole px per cell only", () => {
    expect(robinSize(4)).toEqual({ width: ROBIN_W * 4, height: 88 });
    expect(() => robinSize(2.5)).toThrow();
    expect(() => robinSize(0)).toThrow();
  });

  it("paints every run of the art, one path per colour and layer", () => {
    for (const mood of ["normal", "happy", "curious", "sleepy"] as const) {
      for (const layer of ["body", "beak", "beakOpen", "wingUp", "eye", "extra"] as const) {
        const runs = ROBIN_ART[mood][layer];
        const paths = robinLayer(mood, layer);
        expect(new Set(paths.map(([fill]) => fill))).toEqual(new Set(runs.map((r) => r.fill)));
        const area = paths.flatMap(([, d]) => pathPoints(d)).reduce((sum, s) => {
          const xs = s.map(([x]) => x);
          const ys = s.map(([, y]) => y);
          return sum + (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        }, 0);
        expect(area, `${mood} ${layer}`).toBe(runs.reduce((sum, r) => sum + r.w, 0));
      }
    }
    expect(ROBIN_H).toBe(22);
  });

  it("wears each mood's marks: chirps, a question, sleep", () => {
    expect(robinLayer("happy", "extra").map(([f]) => f)).toEqual(["#e54848"]);
    expect(robinLayer("curious", "extra").map(([f]) => f)).toEqual(["#e54848"]);
    expect(robinLayer("sleepy", "extra").map(([f]) => f)).toEqual(["#9a9a9a"]);
    expect(robinLayer("sleepy", "eye")).toEqual([]); // eyes shut
  });
});

describe("type roles on native", () => {
  it("sets each role in its own font file, never a synthesised weight", () => {
    expect(textStyle("pxTitle")).toEqual({ fontFamily: "Dogica-Bold", fontSize: 16, lineHeight: 24, letterSpacing: 0, fontWeight: "normal" });
    expect(textStyle("tNumXl")).toMatchObject({ fontFamily: "Geist-SemiBold", fontSize: 32, lineHeight: 40, letterSpacing: -0.96, fontVariant: ["tabular-nums"] });
    expect(textStyle("tLabel").fontFamily).toBe("Geist-Medium");
    expect(textStyle("body").fontFamily).toBe("Geist-Regular");
    expect(textStyle("pxTag")).toMatchObject({ fontFamily: "Dogica-Pixel", letterSpacing: 1, textTransform: "uppercase" });
    expect(textStyle("mono").fontFamily).toBe(FONT.geistMono);
    for (const role of Object.values(TYPE)) expect(Object.keys(FONT_FILES)).toContain(familyOf(role));
  });

  it("narrows Dogica's spaces by a quarter em, as the web's word-spacing does", () => {
    expect(isPixelRole("pxTitle")).toBe(true);
    expect(isPixelRole("tHead")).toBe(false);
    expect(isPixelRole("mono")).toBe(false);
    expect(pixelSpaceLetterSpacing("pxTitle")).toBe(-4); // 16px: 0 tracking − 4
    expect(pixelSpaceLetterSpacing("pxTagBold")).toBe(-1); // 8px: 1px tracking − 2
    expect(splitSpaces("Savings  goals")).toEqual([
      { text: "Savings", space: false },
      { text: "  ", space: true },
      { text: "goals", space: false },
    ]);
  });

  it("casts the web's shadows as React Native boxShadow", () => {
    expect(nativeShadow(SHADOW.card)).toEqual([{ offsetX: 0, offsetY: 10, blurRadius: 20, spreadDistance: -16, color: "rgba(17, 17, 17, 0.1)" }]);
    expect(nativeShadow(SHADOW.raised)).toHaveLength(2);
  });
});

describe("the app's fonts", () => {
  it("loads exactly the shared font files, from the web's folder", () => {
    const source = readFileSync(join(mobileRoot, "lib/brand/fonts.ts"), "utf8");
    const loaded = Object.fromEntries(
      [...source.matchAll(/"([\w-]+)": require\("\.\.\/\.\.\/\.\.\/([^"]+)"\)/g)].map((m) => [m[1], m[2]]),
    );
    expect(loaded).toEqual(FONT_FILES);
  });
});

describe("Metro", () => {
  it("watches the shared web folders and resolves packages from the app only", async () => {
    const config = (await import("../../metro.config.js")).default as {
      watchFolders: string[];
      resolver: { nodeModulesPaths: string[]; blockList: RegExp[] };
    };
    const web = join(mobileRoot, "..");
    expect(config.watchFolders).toEqual(["src/lib/brand", "src/lib/crystal", "src/app/fonts"].map((d) => join(web, d)));
    expect(config.resolver.nodeModulesPaths).toEqual([join(mobileRoot, "node_modules")]);
    const blocked = (p: string) => config.resolver.blockList.some((re) => re.test(p));
    expect(blocked(join(web, "node_modules", "react", "index.js"))).toBe(true);
    expect(blocked(join(mobileRoot, "node_modules", "react", "index.js"))).toBe(false);
    expect(blocked(join(web, "src", "lib", "brand", "tokens.ts"))).toBe(false);
  });
});

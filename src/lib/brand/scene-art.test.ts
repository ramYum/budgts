import { describe, expect, it } from "vitest";
import {
  BACKDROP_MUTED,
  BACKDROP_SKY,
  P,
  backdropSize,
  drawBackdrop,
  rectsPath,
  rgb,
  sceneRects,
  sceneRgba,
  type Grid,
} from "./scene-art";

/** FNV-1a over every cell, in order: pins a scene without storing it. */
function fingerprint(g: Grid): string {
  let h = 0x811c9dc5;
  for (const c of g.px) {
    const s = c ?? "-";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16);
}

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = rgb(c).map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Phones, a tablet, desktop windows with no tab bar, a landscape phone and a
// window squeezed short: the backdrop must draw whole at any of them.
const VIEWPORTS: [number, number, number][] = [
  [390, 844, 69],
  [360, 780, 90],
  [412, 915, 94],
  [430, 932, 110],
  [820, 1180, 90],
  [1192, 900, 0],
  [844, 390, 69],
  [390, 160, 69],
];

describe("backdropSize", () => {
  it("is the approved mock-up's geometry at 390×844 over a 69 px tab bar", () => {
    expect(backdropSize(390, 844, 69)).toEqual({ cols: 195, rows: 422, land: 376 });
  });

  it("covers odd sizes with whole cells, and sets the meadow the same gap above any bar", () => {
    expect(backdropSize(391, 845, 0)).toEqual({ cols: 196, rows: 423, land: 411 });
    expect(backdropSize(412, 915, 94).land).toBe(458 - 59);
  });
});

describe("drawBackdrop", () => {
  it("draws the approved mock-up's scene exactly (verified pixel for pixel against the art page, 2026-10-02)", () => {
    expect(fingerprint(drawBackdrop(195, 422, 376))).toBe("2e03c12e");
  });

  it("is the same scene every time", () => {
    expect(fingerprint(drawBackdrop(206, 458, 399))).toBe(fingerprint(drawBackdrop(206, 458, 399)));
  });

  it.each(VIEWPORTS)("fills every cell at %i×%i (bar %i): no gaps, no unpainted cells", (w, h, inset) => {
    const { cols, rows, land } = backdropSize(w, h, inset);
    const g = drawBackdrop(cols, rows, land);
    expect(g.px).toHaveLength(cols * rows);
    expect(g.px.every((c) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c) && c !== "#000000")).toBe(true);
  });

  it.each(VIEWPORTS.filter(([, h]) => h >= 600))("keeps the top band whole behind the header at %i×%i", (w, h, inset) => {
    const { cols, rows, land } = backdropSize(w, h, inset);
    const g = drawBackdrop(cols, rows, land);
    // the header's tint is the top band: its 56 px (28 rows) must be that band only
    for (let y = 0; y < 28; y++) for (let x = 0; x < cols; x++) expect(g.get(x, y)).toBe(BACKDROP_SKY[0]);
  });

  it("anchors the meadow and the edge pines just above the tab bar", () => {
    const { cols, rows, land } = backdropSize(412, 915, 94);
    const g = drawBackdrop(cols, rows, land);
    const grass = new Set<string>([P.grass.edge, P.grass.tuft, P.grass.tip, P.grass.bladeLight, P.grass.bladeDark, ...P.grass.bands]);
    // under the meadow's top edge (it waves a cell either way), the middle of the screen is grass
    expect(grass.has(g.get(Math.floor(cols / 2), land + 3)!)).toBe(true);
    // and the rows above the lake are not
    expect(grass.has(g.get(Math.floor(cols / 2), land - 20)!)).toBe(false);
    const pine = new Set(Object.values(P.pine));
    expect(pine.has(g.get(4, land)!)).toBe(true); // the left pine
    expect(pine.has(g.get(cols - 2, land - 20)!)).toBe(true); // the tallest, on the right
  });
});

describe("renderers' input", () => {
  const g = drawBackdrop(195, 422, 376);

  it("sceneRects covers every cell exactly once, in its own colour", () => {
    const seen = new Array<string | null>(g.w * g.h).fill(null);
    for (const [colour, rects] of sceneRects(g))
      for (const [x, y, w, h] of rects)
        for (let j = y; j < y + h; j++)
          for (let i = x; i < x + w; i++) {
            expect(seen[j * g.w + i]).toBeNull();
            seen[j * g.w + i] = colour;
          }
    expect(seen).toEqual(g.px);
  });

  it("sceneRects merges the sky into a handful of blocks", () => {
    const top = sceneRects(g).get(BACKDROP_SKY[0]!)!;
    expect(top.length).toBeLessThan(4);
  });

  it("rectsPath draws each rect as one closed subpath at the given scale", () => {
    expect(
      rectsPath(
        [
          [1, 2, 3, 4],
          [0, 0, 1, 1],
        ],
        2,
      ),
    ).toBe("M2 4h6v8h-6zM0 0h2v2h-2z");
  });

  it("sceneRgba is one opaque pixel a cell, in the cell's colour", () => {
    const px = sceneRgba(g);
    expect(px).toHaveLength(g.w * g.h * 4);
    const i = 300 * g.w + 100;
    expect([...px.slice(i * 4, i * 4 + 4)]).toEqual([...rgb(g.px[i]!), 255]);
  });
});

describe("text on the backdrop", () => {
  it("BACKDROP_MUTED holds 4.5:1 on every sky band, where the gray muted does not", () => {
    for (const band of BACKDROP_SKY) expect(contrast(BACKDROP_MUTED, band)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#6b6b70", BACKDROP_SKY[0]!)).toBeLessThan(4.5);
  });

  it("ink holds 7:1 on every band", () => {
    for (const band of BACKDROP_SKY) expect(contrast("#111111", band)).toBeGreaterThanOrEqual(7);
  });
});

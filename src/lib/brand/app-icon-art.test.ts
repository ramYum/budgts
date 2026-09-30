import { describe, expect, it } from "vitest";
import { ICON_CARD, ICON_DISC_RADIUS, ICON_GRID, ICON_LAYERS, ICON_ROBIN, ICON_ROBIN_AT, appIconSvg, iconGround } from "./app-icon-art";
import { ROBIN_ART } from "./robin-art";
import { COLOR } from "./tokens";

/** The native launcher icon (app-icon-art.ts): the sign-in badge on an ink tile. */

const MID = ICON_GRID / 2;
const all = [...ICON_LAYERS.back, ...ICON_LAYERS.front];
const robinFills = new Set(Object.values(ROBIN_ART).flatMap((art) => Object.values(art).flatMap((runs) => runs.map((r) => r.fill))));

describe("app icon art", () => {
  it("draws Crystal from robin-art.ts unchanged, cell for cell", () => {
    const art = ROBIN_ART.normal;
    const expected = [...art.body, ...art.beak, ...art.eye, ...art.extra].flatMap((r) =>
      Array.from({ length: r.w }, (_, i) => `${r.x + 1 + i},${r.y + 1},${r.fill}`),
    );
    expect(ICON_ROBIN.map(([x, y, f]) => `${x},${y},${f}`).sort()).toEqual(expected.sort());
    const [ax, ay] = ICON_ROBIN_AT;
    expect(ICON_LAYERS.robin.map(([x, y, f]) => `${x - ax},${y - ay},${f}`).sort()).toEqual(expected.sort());
  });

  it("uses only the brand's palette and Crystal's own: no new hue", () => {
    const allowed = new Set<string>([...Object.values(COLOR), ...robinFills].map((c) => c.toLowerCase()));
    for (const [, , fill] of all) expect(allowed, fill).toContain(fill);
    for (let y = -4; y < ICON_GRID + 4; y++) for (let x = -4; x < ICON_GRID + 4; x++) expect(allowed).toContain(iconGround(x, y));
  });

  it("stands Crystal on her card, centred, with four of five progress cells lit", () => {
    const [ax, ay] = ICON_ROBIN_AT;
    const feet = Math.max(...ICON_ROBIN.map((c) => c[1])) + ay;
    expect(feet).toBe(ICON_CARD.y - 1);
    const right = Math.max(...ICON_ROBIN.map((c) => c[0]));
    expect(Math.abs(ax + (right + 1) / 2 - MID)).toBeLessThanOrEqual(0.5);
    const lit = ICON_LAYERS.front.filter(([x, y, f]) => f === COLOR.charcoal && y >= ICON_CARD.y && x >= ICON_CARD.x);
    expect(lit).toHaveLength(4 * 4); // four 2×2 cells
  });

  it("keeps every mark on the paper disc, a clear cell from any grid dot", () => {
    for (const [x, y] of all) expect((x + 0.5 - MID) ** 2 + (y + 0.5 - MID) ** 2).toBeLessThanOrEqual(ICON_DISC_RADIUS ** 2);
    const drawn = new Map(all.map(([x, y, f]) => [`${x},${y}`, f]));
    const at = (x: number, y: number) => drawn.get(`${x},${y}`) ?? iconGround(x, y);
    for (const [x, y, f] of all) {
      if (f === COLOR.paper) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = `${x + dx},${y + dy}`;
        if (drawn.has(k)) continue;
        expect(at(x + dx, y + dy), `a dot touches ${x},${y}`).not.toBe(COLOR.gray);
      }
    }
  });

  it("fits the platforms: Android's foreground inside the 66dp safe circle, iOS's marks well inside its rounded corners", () => {
    // Android: 15px a cell, centred on a 1024 layer; the safe circle is 66/108 of it
    const s = 15;
    const o = (1024 - ICON_GRID * s) / 2;
    const r = ((66 / 108) * 1024) / 2;
    for (const [x, y] of ICON_LAYERS.front)
      for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] as const)
        expect(Math.hypot(o + cx * s - 512, o + cy * s - 512)).toBeLessThanOrEqual(r);
    // iOS: 23px a cell; every mark within the central 88% (the mask only rounds the corners)
    const si = 23;
    const oi = (1024 - ICON_GRID * si) / 2;
    for (const [x] of all) {
      expect(oi + x * si).toBeGreaterThanOrEqual(1024 * 0.06);
      expect(oi + (x + 1) * si).toBeLessThanOrEqual(1024 * 0.94);
    }
  });

  it("renders on whole pixels, the ground bleeding to the canvas edge", () => {
    const svg = appIconSvg({ size: 1024, scale: 23 });
    for (const m of svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)"/g)) for (const v of m.slice(1, 4)) expect(Number.isInteger(Number(v))).toBe(true);
    expect(svg).toContain(`<rect width="1024" height="1024" fill="${COLOR.charcoal}"/>`);
    const fg = appIconSvg({ size: 1024, scale: 15, parts: ["front"] });
    expect(fg).not.toContain('<rect width="1024"'); // transparent: no ground
  });

  it("gives the themed icon Crystal alone, recoloured", () => {
    const mono = appIconSvg({ size: 1024, scale: 15, parts: ["robin"], only: (f) => f === COLOR.charcoal, recolor: "#ffffff" });
    const rects = [...mono.matchAll(/fill="(#[0-9a-f]+)"/g)].map((m) => m[1]);
    expect(new Set(rects)).toEqual(new Set(["#ffffff"]));
    expect(rects.length).toBe(ICON_LAYERS.robin.filter(([, , f]) => f === COLOR.charcoal).length);
  });
});

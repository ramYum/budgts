import { describe, expect, it } from "vitest";
import { compareGeometry, cropRgba, pixelHex, relativeBoxes, sharedSize, toPixels } from "../../../tools/parity/compare-lib";

const box = (key: string, x: number, y: number, w = 10, h = 10) => ({ key, x, y, w, h });

describe("geometry", () => {
  it("passes within 1pt and fails beyond it", () => {
    const rows = compareGeometry([box("a", 0, 0), box("b", 0, 0)], [box("a", 1, 0.5), box("b", 0, 0, 11.5)]);
    expect(rows.find((r) => r.key === "a")).toMatchObject({ ok: true, delta: 1 });
    expect(rows.find((r) => r.key === "b")).toMatchObject({ ok: false, delta: 1.5 });
  });
  it("fails an id present on one side only", () => {
    const rows = compareGeometry([box("a", 0, 0)], [box("b", 0, 0)]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.ok && r.delta === null)).toBe(true);
  });
  it("measures from each side's screen root and drops boxes outside it", () => {
    const rel = relativeBoxes([box("in", 0, 30), box("out", 0, 2000)], { x: 0, y: 24, w: 412, h: 860 });
    expect(rel.map((b) => [b.key, b.y])).toEqual([["in", 6]]);
  });
});

describe("pixels", () => {
  const img = { width: 2, height: 2, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 17, 17, 17, 255]) };
  it("reads a pixel as hex, null outside", () => {
    expect(pixelHex(img, 0, 0)).toBe("#ff0000");
    expect(pixelHex(img, 1, 1)).toBe("#111111");
    expect(pixelHex(img, 2, 0)).toBeNull();
  });
  it("crops a rect out of an RGBA buffer", () => {
    expect(Array.from(cropRgba(img, { x: 1, y: 0, w: 1, h: 2 }))).toEqual([0, 255, 0, 255, 17, 17, 17, 255]);
  });
  it("scales logical rects to clamped pixel rects and compares the shared area", () => {
    expect(toPixels({ x: 0, y: 24, w: 412, h: 915 }, 2.625, 1080, 2400)).toEqual({ x: 0, y: 63, w: 1080, h: 2337 });
    expect(sharedSize({ x: 0, y: 0, w: 1082, h: 2402 }, { x: 0, y: 0, w: 1080, h: 2337 })).toMatchObject({ w: 1080, h: 2337 });
  });
});

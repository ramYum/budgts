import { describe, expect, it } from "vitest";
import { pathPoints } from "../brand/snap";
import { cellLayout, cellsPath, sweepEdge } from "./cells";

describe("cellLayout (the web's .px-bar)", () => {
  it("fits as many 8px cells with at least 2px gaps as the bar holds, flush at both ends", () => {
    const l = cellLayout(342, { share: 0.5, minLit: 1 });
    expect(l.n).toBe(34);
    expect(l.pitch).toBeCloseTo((342 - 8) / 33);
    expect(l.pitch - 8).toBeGreaterThanOrEqual(2);
    expect(l.xs[0]).toBe(0);
    expect(l.xs[l.n - 1]! + 8).toBeCloseTo(342);
    expect(l.lit).toBe(17);
  });

  it("lights at least one cell once anything counts, none at zero, never more than fit", () => {
    expect(cellLayout(100, { share: 0.001, minLit: 1 }).lit).toBe(1);
    expect(cellLayout(100, { share: 0, minLit: 0 }).lit).toBe(0);
    expect(cellLayout(100, { share: 3, minLit: 1 }).lit).toBe(cellLayout(100, { share: 1, minLit: 1 }).n);
  });

  it("rounds a half up, like CSS round(nearest)", () => {
    const l = cellLayout(88, { share: 0.5, minLit: 1 }); // n = 9 → 4.5 → 5
    expect(l.n).toBe(9);
    expect(l.lit).toBe(5);
  });

  it("sizes by the cell height (the 12px hero bar)", () => {
    const l = cellLayout(342, { share: 1, minLit: 1, cellH: 12 });
    expect(l.n).toBe(Math.floor(344 / 14));
  });

  it("a one-cell bar still draws its cell", () => {
    expect(cellLayout(8, { share: 1, minLit: 1 })).toMatchObject({ n: 1, lit: 1 });
  });
});

describe("cellsPath", () => {
  it("draws square cells on whole device pixels", () => {
    const ratio = 2.625;
    const l = cellLayout(100, { share: 1, minLit: 1 });
    const shapes = pathPoints(cellsPath(l, 3, 8, ratio));
    expect(shapes).toHaveLength(3);
    for (const shape of shapes)
      for (const [x, y] of shape) {
        expect(Math.abs(x * ratio - Math.round(x * ratio))).toBeLessThan(1e-9);
        expect(Math.abs(y * ratio - Math.round(y * ratio))).toBeLessThan(1e-9);
      }
  });
});

describe("sweepEdge", () => {
  it("every step's edge lands in the gap after the last arrived cell, so no cell is ever cut", () => {
    for (const width of [40, 88, 213, 342]) {
      const l = cellLayout(width, { share: 1, minLit: 1 });
      for (let k = 1; k < l.n; k++) {
        const edge = sweepEdge(l, k);
        expect(edge).toBeGreaterThanOrEqual(l.xs[k - 1]! + 8 - 1e-9);
        expect(edge).toBeLessThanOrEqual(l.xs[k]! + 1e-9);
      }
      expect(sweepEdge(l, l.n)).toBeGreaterThanOrEqual(width);
    }
  });
});

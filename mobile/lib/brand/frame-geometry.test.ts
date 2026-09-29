import { describe, expect, it } from "vitest";
import { CELL, FRAMES, frameSvg, type FrameSpec } from "./shared";
import { frameBorder, framePaths, frameSpec, frameStates } from "./frame-geometry";
import { pathPoints } from "./snap";

/** The px cells a path paints (its rectangles, cell by cell). */
function cells(d: string | null, cell = CELL): Set<string> {
  const out = new Set<string>();
  if (!d) return out;
  for (const shape of pathPoints(d)) {
    const xs = shape.map(([x]) => x);
    const ys = shape.map(([, y]) => y);
    for (let y = Math.min(...ys); y < Math.max(...ys); y += cell) {
      for (let x = Math.min(...xs); x < Math.max(...xs); x += cell) out.add(`${x},${y}`);
    }
  }
  return out;
}

/** What the web's 9-slice SVG paints, per colour (src/lib/brand/pixel-frame.ts frameSvg). */
function webCells(spec: FrameSpec): { fill: Set<string>; line: Set<string> } {
  const svg = frameSvg(spec);
  const get = (color: string) => [...svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].filter((m) => m[1] === color).map((m) => m[2]!);
  const fill = spec.fill === spec.line ? [] : get(spec.fill);
  const line = get(spec.line);
  return { fill: cells(fill.join("") || null), line: cells(line.join("") || null) };
}

describe("frame geometry", () => {
  it("at the slice's own size, paints exactly the web's 9-slice, for every frame and state", () => {
    for (const { name, states } of FRAMES) {
      for (const [suffix, spec] of states) {
        const n = (2 * spec.k + 1) * CELL;
        const mine = framePaths(spec, n, n);
        const web = webCells(spec);
        if (spec.fill === spec.line) {
          // a solid shape: the web draws it in one colour, whichever layer
          expect(new Set([...cells(mine.fill), ...cells(mine.line)]), `${name}${suffix}`).toEqual(
            new Set([...web.fill, ...web.line]),
          );
        } else {
          expect(cells(mine.fill), `${name}${suffix} fill`).toEqual(web.fill);
          expect(cells(mine.line), `${name}${suffix} line`).toEqual(web.line);
        }
      }
    }
  });

  it("stretches only the middle cell: corners keep their steps at any size", () => {
    const spec = frameSpec("px-card", ":is(a, button):focus-visible");
    const small = framePaths(spec, 18, 18);
    const big = framePaths(spec, 300, 120);
    const corner = (s: Set<string>) => [...s].filter((k) => k.split(",").every((v) => Number(v) < 8));
    expect(corner(cells(big.line))).toEqual(corner(cells(small.line)));
    // the line reaches the far corner: its bottom-right step sits at the box's edge
    const xs = [...cells(big.line)].map((k) => Number(k.split(",")[0]));
    expect(Math.max(...xs)).toBe(300 - CELL);
  });

  it("covers the whole box but the corner notches", () => {
    const spec = frameSpec("px-card");
    const { fill, line } = framePaths(spec, 100, 60);
    const painted = cells(fill).size + cells(line).size;
    // a card's corner (r3) leaves 3 + 1 + 1 cells empty in each of its four corners
    expect(painted).toBe((100 / CELL) * (60 / CELL) - 4 * (3 + 1 + 1));
  });

  it("puts every edge on a whole device pixel when given the screen's density", () => {
    const ratio = 2.625;
    const { fill, line } = framePaths(frameSpec("px-field", ":focus-within"), 172, 44, ratio);
    for (const shape of [...pathPoints(fill!), ...pathPoints(line!)]) {
      for (const [x, y] of shape) {
        expect(Math.abs(x * ratio - Math.round(x * ratio))).toBeLessThan(1e-6);
        expect(Math.abs(y * ratio - Math.round(y * ratio))).toBeLessThan(1e-6);
      }
    }
  });

  it("reads the web's frame table", () => {
    expect(frameBorder(frameSpec("px-card"))).toBe(8);
    expect(frameBorder(frameSpec("px-btn"))).toBe(6);
    expect(frameBorder(frameSpec("px-chip"))).toBe(4);
    expect(frameStates("px-field")).toEqual(["", ":hover", ":focus-within", "[data-invalid='true']"]);
    expect(() => frameSpec("px-nope")).toThrow();
    expect(() => frameSpec("px-card", ":nope")).toThrow();
  });
});

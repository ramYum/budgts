import { CELL, FRAMES, frameCells, type FrameSpec } from "./shared";
import { snap } from "./snap";

/**
 * A stepped frame drawn at a box's measured size: what the web's CSS
 * `border-image` does with the same 9-slice (src/lib/brand/pixel-frame.ts).
 *
 * The slice is (2k+1)² cells. Its corners (k cells a side) keep their size;
 * the middle row and column, one cell, stretch along each edge and across the
 * centre. So a cell's x maps to: x itself in the left corner, the stretch in
 * the middle, and `width - (slice - x)` in the right corner (y likewise).
 * Every cell is a whole rectangle, so each run of cells in a row stays one
 * rectangle after the stretch, and the result is exactly the web's frame.
 */

export type FrameName = (typeof FRAMES)[number]["name"];

export type FramePaths = { fill: string | null; line: string | null; spec: FrameSpec };

/** The frame's border width in px (`border: k·2px` on the web). */
export function frameBorder(spec: Pick<FrameSpec, "k">): number {
  return spec.k * CELL;
}

/** The frame a name and state draws; state is the web's selector suffix ("" at rest). */
export function frameSpec(name: string, state = ""): FrameSpec {
  const frame = FRAMES.find((f) => f.name === name);
  if (!frame) throw new Error(`no frame ${name}`);
  const hit = frame.states.find(([suffix]) => suffix === state);
  if (!hit) throw new Error(`${name} has no state "${state}"`);
  return hit[1];
}

/** The states a frame defines, by the web's selector suffix. */
export function frameStates(name: string): string[] {
  return FRAMES.find((f) => f.name === name)?.states.map(([s]) => s) ?? [];
}

/** At `ratio` device px per px every edge lands on a whole device pixel (snap.ts); without it, exact px. */
export function framePaths(spec: FrameSpec, width: number, height: number, ratio?: number): FramePaths {
  const round = (n: number) => (ratio ? snap(n, ratio) : Math.round(n * 1000) / 1000);
  const cells = frameCells(spec);
  const n = cells.length;
  const k = spec.k;
  const b = k * CELL;
  const map = (i: number, size: number) => (i <= k ? i * CELL : i === k + 1 ? size - b : size - (n - i) * CELL);
  // `map(i)` is where cell edge i lands; edges k and k+1 bound the stretched cell.
  const w = Math.max(width, 2 * b);
  const h = Math.max(height, 2 * b);
  const runs: Record<"line" | "fill", string[]> = { line: [], fill: [] };
  cells.forEach((row, y) => {
    const y0 = map(y, h);
    const y1 = map(y + 1, h);
    if (y1 <= y0) return;
    let x = 0;
    while (x < n) {
      const kind = row[x];
      let end = x;
      while (end < n && row[end] === kind) end++;
      const x0 = map(x, w);
      const x1 = map(end, w);
      if (kind && x1 > x0) runs[kind].push(`M${round(x0)} ${round(y0)}H${round(x1)}V${round(y1)}H${round(x0)}Z`);
      x = end;
    }
  });
  return {
    fill: runs.fill.length ? runs.fill.join("") : null,
    line: runs.line.length ? runs.line.join("") : null,
    spec,
  };
}

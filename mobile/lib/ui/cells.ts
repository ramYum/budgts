import { snap } from "../brand/snap";

/**
 * The progress cells' geometry (the web's `.px-cells` / `.px-bar`,
 * src/app/globals.css): square cells `cellH` a side with at least `gap`
 * between, as many as fit the bar; the first and last sit flush with the
 * bar's ends and the spare pixels spread across the gaps. `share` (0–1) picks
 * how many light: round(share × n), at least `minLit` (1 once anything
 * counts). Pure presentation of a percentage the server computed.
 */
export type CellLayout = {
  /** cells that fit */
  n: number;
  /** distance from one cell's left edge to the next's */
  pitch: number;
  /** cells lit at rest */
  lit: number;
  /** each cell's left edge */
  xs: number[];
  /** how wide the reveal window is once every cell has arrived: past the last cell, half a gap on */
  sweepWidth: number;
};

export function cellLayout(width: number, o: { share: number; minLit: 0 | 1; cellH?: number; gap?: number }): CellLayout {
  const h = o.cellH ?? 8;
  const gap = o.gap ?? 2;
  const n = Math.max(1, Math.floor((width + gap) / (h + gap) + 0.000001));
  const pitch = (width - h) / Math.max(1, n - 1);
  // CSS round(nearest): halves go up
  const lit = Math.min(n, Math.max(o.minLit, Math.floor(Math.max(0, o.share) * n + 0.5)));
  const cut = (pitch - h) / 2;
  return { n, pitch, lit, xs: Array.from({ length: n }, (_, i) => i * pitch), sweepWidth: n * pitch - cut };
}

/** One path of `count` square cells from the layout, every edge on a whole device pixel (the web's hard gradient stops). */
export function cellsPath(layout: CellLayout, count: number, cellH: number, ratio: number): string {
  let d = "";
  for (let i = 0; i < Math.min(count, layout.n); i++) {
    const x0 = snap(layout.xs[i]!, ratio);
    const x1 = snap(layout.xs[i]! + cellH, ratio);
    const y1 = snap(cellH, ratio);
    d += `M${x0} 0H${x1}V${y1}H${x0}Z`;
  }
  return d;
}

/**
 * The sweep's window edge after `k` of `n` cells have arrived, when the window
 * grows in `n` equal steps to `sweepWidth` (a CSS `steps(n, jump-start)`
 * width animation). Always between cell k's right edge and cell k+1's left
 * edge, so a step shows whole cells only, as the web's `round(up, …)` does.
 */
export function sweepEdge(layout: CellLayout, k: number): number {
  return (k * layout.sweepWidth) / layout.n;
}

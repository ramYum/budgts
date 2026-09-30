/**
 * The pixel charts' drawing geometry, one source for the web's cards
 * (src/components/spending-overview.tsx) and the apps' (mobile/components/charts).
 * Presentation only: how many cells a server-computed amount lights, and
 * where each cell sits. Every figure itself (spend per month, the breakdown's
 * slices and shares) comes from the server's shared figure functions.
 */
import { formatMonthName } from "./dates.ts";

/* ─── Spending · 6 months (segmented columns) ────────────────────────────── */

export const TREND_ROWS = 14;
/** px: one column of flat segments per month */
export const TREND_SEG_W = 24;
export const TREND_SEG_H = 4;
/** px between segments */
export const TREND_GAP = 2;

export type TrendColumn = { month: string; spend: number; label: string; current: boolean; lit: number };

/** Each month's column: its short name, whether it is the shown month (the last), and how many of 14 rows it lights. */
export function trendColumns(trend: readonly { month: string; spend: number }[]): TrendColumn[] {
  const max = Math.max(0, ...trend.map((t) => t.spend));
  return trend.map((t, i) => ({
    month: t.month,
    spend: t.spend,
    label: formatMonthName(t.month, "short"),
    current: i === trend.length - 1,
    lit: max > 0 && t.spend > 0 ? Math.max(1, Math.round((t.spend / max) * TREND_ROWS)) : 0,
  }));
}

/** "$1,671" for a chart tag: whole units, cut (not rounded) so the tag never claims more than was spent. */
export function formatWhole(minor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.trunc(minor / 100));
}

/** "+$120.00" / "−$40.00": a change against last month, with the web's minus sign. */
export function formatSignedChange(delta: number, format: (minor: number) => string): string {
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${format(Math.abs(delta))}`;
}

/* ─── Where your money goes (a ring of cells) ────────────────────────────── */

/**
 * The ring's colours after the highlighted slice (which is the accent): a neutral ramp by size. Monochrome + one
 * accent, so identity is never colour-alone; the legend names every slice.
 */
export const RING_NEUTRALS = ["#111111", "#6e6e6e", "#9e9e9e", "#d0d0d0"] as const;

/** A 20×20 grid of 6px cells on an 8px pitch: a fine ring about two and a half cells thick, with room for the total. */
export const RING_GRID = 20;
export const RING_PITCH = 8;
export const RING_DOT = 6;
const R_OUT = 9.9;
const R_IN = 7.2;
/** The ring's box, px. */
export const RING_SIZE = RING_GRID * RING_PITCH - (RING_PITCH - RING_DOT);

/** Ring cells (grid x, y) in clockwise order from 12 o'clock. */
export const RING: readonly { x: number; y: number }[] = (() => {
  const c = (RING_GRID - 1) / 2;
  const cells: { x: number; y: number; a: number }[] = [];
  for (let y = 0; y < RING_GRID; y++)
    for (let x = 0; x < RING_GRID; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);
      if (r <= R_OUT && r >= R_IN) cells.push({ x, y, a: (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI) });
    }
  return cells.sort((p, q) => p.a - q.a).map(({ x, y }) => ({ x, y }));
})();

/** Which slice each ring cell paints: the cell's middle against the slices' running share of `total`. */
export function ringSlices(amounts: readonly number[], total: number): number[] {
  const bounds: number[] = [];
  let acc = 0;
  for (const a of amounts) {
    acc += a / total;
    bounds.push(acc);
  }
  return RING.map((_, i) => {
    const t = (i + 0.5) / RING.length;
    const k = bounds.findIndex((b) => t <= b);
    return k === -1 ? amounts.length - 1 : k;
  });
}

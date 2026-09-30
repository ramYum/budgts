import type { ReactNode } from "react";
import { formatMoney } from "@/lib/display/money";
import type { DashboardBar } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";
import { spendingBreakdown, trendChange } from "@/lib/insights/figures";
import { RollingAmount } from "./rolling-amount";
import { formatMonthName } from "@/lib/display/dates";
import {
  RING,
  RING_DOT,
  RING_NEUTRALS,
  RING_PITCH,
  RING_SIZE,
  TREND_GAP as GAP,
  TREND_ROWS as ROWS,
  TREND_SEG_H as SEG_H,
  TREND_SEG_W as SEG_W,
  formatSignedChange,
  formatWhole,
  ringSlices,
  trendColumns,
} from "@/lib/display/charts";

// Pixel charts: plain server-rendered markup, no chart library and no client
// JS. Every mark is a square cell on whole pixels; cells step in on first
// paint (globals.css `.cell`). Values are always also printed as text (labels,
// legend, aria), so no number is readable only from a mark.



/**
 * Six months of spending as segmented columns: past months in quiet gray, the
 * current month in the accent with its value tagged on top (the one
 * highlighted mark). Unlit rows show as a faint track, so every column reads
 * against the same height.
 *
 * `figure="total"` (Home) leads with this month's spending; `figure="change"`
 * (Insights) leads with the change against last month.
 */
export function SpendingTrendCard({
  trend,
  currency,
  figure = "total",
  title,
}: {
  trend: MonthSpend[];
  currency: string;
  figure?: "total" | "change";
  /** a pixel tag inside the card (when the section has no heading outside it) */
  title?: string;
}) {
  const { total, delta, previousMonth } = trendChange(trend);
  const prevName = previousMonth ? formatMonthName(previousMonth, "long") : "";
  const data = trendColumns(trend);
  const signed = (v: number) => formatSignedChange(v, (m) => formatMoney(m, currency));

  return (
    <section className="px-card p-2 md:p-4" data-testid="spending-trend-card">
      {title ? <h2 className="mb-1 text-sm font-medium leading-5 text-muted">{title}</h2> : null}
      {figure === "change" && delta !== null ? (
        <>
          <p className="t-num-lg text-ink">{signed(delta)}</p>
          <p className="text-sm leading-5 text-muted">vs {prevName}</p>
        </>
      ) : (
        <>
          <p className="t-num-lg text-ink">
            <RollingAmount value={total} currency={currency} />
          </p>
          <p className="text-sm leading-5 text-muted">
            This month
            {delta !== null ? (
              <>
                {" "}
                · <span className="tnum text-ink">{signed(delta)}</span> vs {prevName}
              </>
            ) : null}
          </p>
        </>
      )}

      <div
        role="img"
        aria-label={`Spending by month: ${data.map((d) => `${d.label} ${formatMoney(d.spend, currency)}`).join(", ")}`}
        className="mt-8 grid grid-cols-6 items-end gap-2 pt-7"
      >
        {data.map((d, col) => (
          <div
            key={d.month}
            className="flex flex-col items-center gap-3"
            title={`${d.label}: ${formatMoney(d.spend, currency)}`}
          >
            {/* flat segments, built bottom-up over a faint track */}
            <div className="relative flex flex-col" style={{ gap: GAP, width: SEG_W }}>
              {Array.from({ length: ROWS }, (_, i) => {
                const rowFromBottom = ROWS - 1 - i;
                const lit = rowFromBottom < d.lit;
                return (
                  <span
                    key={i}
                    className={`cell block w-full ${lit ? (d.current ? "bg-signal" : "bg-silver") : "bg-surface-2"}`}
                    style={{ height: SEG_H, ["--d" as string]: col * 3 + rowFromBottom }}
                  />
                );
              })}
              {d.current && d.lit > 0 ? (
                // pops on once its column has built (the .cell cadence: 22ms a step after 220ms)
                <span
                  className="pop px-badge-ink t-label-strong tnum absolute right-[-4px] whitespace-nowrap px-1.5 py-1 leading-none text-white md:right-[-8px]"
                  style={{
                    bottom: ROWS * (SEG_H + GAP) + 6,
                    ["--at" as string]: `${(col * 3 + d.lit) * 22 + 380}ms`,
                  }}
                >
                  {formatWhole(d.spend, currency)}
                </span>
              ) : null}
            </div>
            <span className={`text-[15px] leading-5 ${d.current ? "font-semibold text-ink" : "text-muted"}`}>
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Where your money goes": a part-to-whole ring of cells.
 *
 * Deliberate encoding (brand direction: monochrome + one accent): the largest
 * share is the one highlighted slice in the accent; the rest step down a
 * neutral ramp by size, with everything past the 4th folded into "Other"
 * (five named slices show as they are). Identity is never color-alone: the
 * legend names every slice with its amount and share, in the order the ring
 * draws them (clockwise from 12). */
const RAMP = ["var(--signal)", ...RING_NEUTRALS];

// The slices and their shares come from spendingBreakdown (src/lib/insights/figures.ts),
// shared with the native API; RAMP has one colour per slice (BREAKDOWN_SLICES).

// The ring's grid (20×20 cells of 6px on an 8px pitch) and which slice each
// cell paints come from src/lib/display/charts.ts, shared with the apps.

export function SpendingBreakdownCard({
  bars,
  totalSpent,
  currency,
  layout = "stack",
  header,
}: {
  bars: DashboardBar[];
  totalSpent: number;
  currency: string;
  /** "stack": ring over legend (a narrow column); "row": ring beside legend */
  layout?: "stack" | "row";
  /** what heads the card, inside its frame (Insights: tag, figure, toggle) */
  header?: ReactNode;
}) {
  const slices = spendingBreakdown(bars, totalSpent).map((s, i) => ({ ...s, color: RAMP[i]! }));
  if (slices.length === 0) {
    return null;
  }

  // cumulative share → which slice each ring cell belongs to
  const sliceOf = ringSlices(
    slices.map((s) => s.amount),
    totalSpent,
  );
  const colorAt = (i: number) => slices[sliceOf[i]!]!.color;
  const size = RING_SIZE;

  return (
    <section className="px-card p-2 md:p-4" data-testid="spending-breakdown-card">
      {header}
      <div className={layout === "row" ? "flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8" : "flex flex-col gap-6"}>
        <div
          className={`relative shrink-0 self-center ${layout === "row" ? "sm:self-auto" : ""}`}
          style={{ width: size, height: size }}
          role="img"
          aria-label={`Spending breakdown: ${slices.map((s) => `${s.name} ${formatMoney(s.amount, currency)}`).join(", ")}`}
        >
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} shapeRendering="crispEdges" aria-hidden>
            {RING.map((cell, i) => (
              <rect
                key={i}
                x={cell.x * RING_PITCH}
                y={cell.y * RING_PITCH}
                width={RING_DOT}
                height={RING_DOT}
                fill={colorAt(i)}
                className="cell"
                style={{ ["--d" as string]: Math.floor(i / 4) }}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <p className="t-label text-muted">Total</p>
            <p className="tnum text-[15px] font-semibold leading-5 text-ink">
              <RollingAmount value={totalSpent} currency={currency} />
            </p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-3">
          {slices.map((s, k) => (
            <li
              key={s.name}
              className="rise flex items-center gap-2.5 text-[15px] leading-6"
              style={{ ["--at" as string]: `${k * 70 + 300}ms` }}
            >
              <span className="h-3 w-3 shrink-0" style={{ background: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
              <span className="tnum shrink-0 text-ink">{formatMoney(s.amount, currency)}</span>
              <span className="t-label tnum w-9 shrink-0 text-right text-muted">{s.share}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

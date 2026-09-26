import type { ReactNode } from "react";
import { formatMoney } from "@/lib/budget/money";
import type { DashboardBar } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";
import { RollingAmount } from "./rolling-amount";

// Pixel charts: plain server-rendered markup, no chart library and no client
// JS. Every mark is a square cell on whole pixels; cells step in on first
// paint (globals.css `.cell`). Values are always also printed as text (labels,
// legend, aria), so no number is readable only from a mark.

function monthLabel(month: string, style: "short" | "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-US", { month: style, timeZone: "UTC" });
}

/** "$1,671" for a chart tag: whole units, cut (not rounded) so the tag never
 * claims more than was spent. Display only; minor units stay the source. */
function formatWhole(minor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Math.trunc(minor / 100),
  );
}

const ROWS = 10;
const CELL = 10; // px, square
const GAP = 2; // px between cells

/**
 * Six months of spending as two-cell columns: past months in quiet gray, the
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
  const current = trend.at(-1);
  const previous = trend.at(-2);
  const total = current?.spend ?? 0;
  const delta = current && previous ? current.spend - previous.spend : null;
  const prevName = previous ? monthLabel(previous.month, "long") : "";
  const max = Math.max(0, ...trend.map((t) => t.spend));
  const data = trend.map((t, i) => ({
    ...t,
    label: monthLabel(t.month, "short"),
    current: i === trend.length - 1,
    lit: max > 0 && t.spend > 0 ? Math.max(1, Math.round((t.spend / max) * ROWS)) : 0,
  }));
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatMoney(Math.abs(v), currency)}`;

  return (
    <section className="px-card p-3 md:p-4">
      {title ? <h2 className="px-tag mb-3 text-ink">{title}</h2> : null}
      {figure === "change" && delta !== null ? (
        <>
          <p className="px-figure tnum text-ink">{signed(delta)}</p>
          <p className="text-sm leading-5 text-muted">vs {prevName}</p>
        </>
      ) : (
        <>
          <p className="px-figure tnum text-ink">
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
            {/* two cells wide, built bottom-up over a faint track */}
            <div
              className="relative grid grid-cols-2"
              style={{ gap: GAP, gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`, width: CELL * 2 + GAP }}
            >
              {Array.from({ length: ROWS * 2 }, (_, i) => {
                const rowFromBottom = ROWS - 1 - Math.floor(i / 2);
                const lit = rowFromBottom < d.lit;
                return (
                  <span
                    key={i}
                    className={`cell ${lit ? (d.current ? "bg-signal" : "bg-silver") : "bg-surface-2"}`}
                    style={{ ["--d" as string]: col * 3 + rowFromBottom }}
                  />
                );
              })}
              {d.current && d.lit > 0 ? (
                // pops on once its column has built (the .cell cadence: 22ms a step after 220ms)
                <span
                  className="pop px-badge-ink px-tag-bold absolute right-[-4px] whitespace-nowrap px-1.5 py-1 leading-none tracking-normal text-white md:right-[-8px]"
                  style={{
                    bottom: ROWS * (CELL + GAP) + 6,
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
const RAMP = ["var(--signal)", "#111111", "#6e6e6e", "#9e9e9e", "#d0d0d0"];

// Grouping (unchanged): known categories in a fixed order, then up to two
// custom ones, then the uncategorized remainder as "Other".
const CHART_ORDER = ["Transportation", "Personal Care", "Food / Groceries", "Insurances", "Entertainment", "Housing"];
const CUSTOM_SLOTS = 2;

// A 14×14 grid of 8px cells on a 10px pitch: a ring three cells thick.
const GRID = 14;
const PITCH = 10;
const DOT = 8;
const R_OUT = 7.05;
const R_IN = 4.05;

/** Ring cells in clockwise order from 12 o'clock, computed once. */
const RING = (() => {
  const c = (GRID - 1) / 2;
  const cells: { x: number; y: number; a: number }[] = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);
      if (r <= R_OUT && r >= R_IN) {
        const a = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
        cells.push({ x, y, a });
      }
    }
  return cells.sort((p, q) => p.a - q.a);
})();

/** Whole-percent shares that add up to exactly 100 (largest remainder), so
 * the legend never reads 101%. */
export function sharesOf(amounts: number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (total <= 0) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors;
}

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
  const known = CHART_ORDER.map((name) => bars.find((b) => b.name === name))
    .filter((b): b is DashboardBar => !!b && b.actual > 0)
    .map((b) => ({ name: b.name, amount: b.actual }));

  const knownNames = new Set(known.map((k) => k.name));
  const custom = bars
    .filter((b) => b.actual > 0 && !knownNames.has(b.name))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, CUSTOM_SLOTS)
    .map((b) => ({ name: b.name, amount: b.actual }));

  const categorized = known.reduce((sum, s) => sum + s.amount, 0) + custom.reduce((sum, s) => sum + s.amount, 0);
  const other = Math.max(0, totalSpent - categorized);

  const grouped = [...known, ...custom, ...(other > 0 ? [{ name: "Other", amount: other }] : [])];

  if (grouped.length === 0 || totalSpent <= 0) {
    return null;
  }

  // Display: every slice when there are five or fewer, else the four largest
  // named slices and everything else as "Other".
  const byAmount = [...grouped].sort((a, b) => b.amount - a.amount);
  const fits = grouped.length <= RAMP.length;
  const top = fits ? byAmount : byAmount.filter((s) => s.name !== "Other").slice(0, 4);
  const rest = totalSpent - top.reduce((sum, s) => sum + s.amount, 0);
  const list = [...top, ...(!fits && rest > 0 ? [{ name: "Other", amount: rest }] : [])];
  const shares = sharesOf(list.map((s) => s.amount));
  const slices = list.map((s, i) => ({ ...s, color: RAMP[i]!, share: shares[i]! }));

  // cumulative share → which slice each ring cell belongs to
  const bounds: number[] = [];
  let acc = 0;
  for (const s of slices) {
    acc += s.amount / totalSpent;
    bounds.push(acc);
  }
  const colorAt = (i: number) => {
    const t = (i + 0.5) / RING.length;
    const k = bounds.findIndex((b) => t <= b);
    return slices[k === -1 ? slices.length - 1 : k]!.color;
  };
  const size = GRID * PITCH - (PITCH - DOT);

  return (
    <section className="px-card p-3 md:p-4">
      {header}
      <div className={layout === "row" ? "flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8" : "flex flex-col gap-6"}>
        <div
          className="relative shrink-0"
          style={{ width: size, height: size }}
          role="img"
          aria-label={`Spending breakdown: ${slices.map((s) => `${s.name} ${formatMoney(s.amount, currency)}`).join(", ")}`}
        >
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} shapeRendering="crispEdges" aria-hidden>
            {RING.map((cell, i) => (
              <rect
                key={i}
                x={cell.x * PITCH}
                y={cell.y * PITCH}
                width={DOT}
                height={DOT}
                fill={colorAt(i)}
                className="cell"
                style={{ ["--d" as string]: Math.floor(i / 4) }}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <p className="px-tag text-muted">Total</p>
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
              <span className="px-tag-bold w-9 shrink-0 text-right tracking-normal text-muted">{s.share}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

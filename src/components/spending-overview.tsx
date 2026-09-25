import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { formatMoney } from "@/lib/budget/money";
import type { DashboardBar } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";

// Pixel charts: plain server-rendered markup, no chart library and no client
// JS. Every mark is a square cell; cells step in on first paint (globals.css
// `.cell`). Values are always also printed as text (labels, legend, aria), so
// no number is readable only from a mark.

function monthShortLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

const ROWS = 9;
const CELL = 10; // px, square
const GAP = 2; // px between cells

/** "Total spending": value + delta + a 6-month column of cells per month.
 * Past months in quiet gray, the current month in the accent with its value
 * tagged on top (the one highlighted mark). */
export function SpendingTrendCard({
  trend,
  changePct,
  currency,
}: {
  trend: MonthSpend[];
  changePct: number | null;
  currency: string;
}) {
  const total = trend.at(-1)?.spend ?? 0;
  const max = Math.max(0, ...trend.map((t) => t.spend));
  const data = trend.map((t, i) => ({
    ...t,
    label: monthShortLabel(t.month),
    current: i === trend.length - 1,
    lit: max > 0 && t.spend > 0 ? Math.max(1, Math.round((t.spend / max) * ROWS)) : 0,
  }));
  const up = changePct !== null && changePct > 0;

  return (
    <section className="card space-y-5 rounded-2xl border border-hairline p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">Total spending</p>
          <p className="tnum mt-1 text-[28px] font-semibold leading-none tracking-tight">
            {formatMoney(total, currency)}
          </p>
          {changePct !== null ? (
            <p className={`tnum mt-2 flex items-center gap-1 text-[13px] ${up ? "text-neg" : "text-pos"}`}>
              {up ? (
                <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight aria-hidden className="h-3.5 w-3.5" />
              )}
              {Math.abs(Math.round(changePct))}% from last month
            </p>
          ) : null}
        </div>
        <span className="rounded-lg border border-hairline px-2.5 py-1 text-xs text-muted">6 months</span>
      </div>

      <div
        role="img"
        aria-label={`Spending by month: ${data.map((d) => `${d.label} ${formatMoney(d.spend, currency)}`).join(", ")}`}
        className="grid grid-cols-6 items-end gap-2 pt-7"
      >
        {data.map((d, col) => (
          <div
            key={d.month}
            className="flex flex-col items-center gap-2"
            title={`${d.label}: ${formatMoney(d.spend, currency)}`}
          >
            {/* two cells wide, built bottom-up; unlit rows stay empty */}
            <div
              className="relative grid grid-cols-2"
              style={{ gap: GAP, gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`, width: CELL * 2 + GAP }}
            >
              {Array.from({ length: ROWS * 2 }, (_, i) => {
                const rowFromBottom = ROWS - 1 - Math.floor(i / 2);
                if (rowFromBottom >= d.lit) return <span key={i} />;
                return (
                  <span
                    key={i}
                    className={`cell rounded-[1px] ${d.current ? "bg-signal" : "bg-[var(--cell-past)]"}`}
                    style={{ ["--d" as string]: col * 3 + rowFromBottom }}
                  />
                );
              })}
              {d.current && d.lit > 0 ? (
                <span
                  className="pixel-corners tnum absolute right-0 whitespace-nowrap bg-ink px-1.5 py-1 text-[11px] font-medium text-on-primary"
                  style={{ bottom: d.lit * (CELL + GAP) + 4 }}
                >
                  {formatMoney(d.spend, currency)}
                </span>
              ) : null}
            </div>
            <span className={`text-[11px] ${d.current ? "font-semibold text-text" : "text-muted"}`}>
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
 * neutral ramp by size, with everything past the 4th folded into "Other".
 * Identity is never color-alone: the legend beside it names every slice with
 * its share, in the same order the ring draws them (clockwise from 12). */
const RAMP = ["var(--signal)", "#111111", "#6e6e6e", "#a8a8a8", "#d6d6d6"];

// Grouping (unchanged): known categories in a fixed order, then up to two
// custom ones, then the uncategorized remainder as "Other".
const CHART_ORDER = ["Transportation", "Personal Care", "Food / Groceries", "Insurances", "Entertainment", "Housing"];
const CUSTOM_SLOTS = 2;

const GRID = 21;
const R_OUT = 10.45;
const R_IN = 7.1;

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

export function SpendingBreakdownCard({
  bars,
  totalSpent,
  currency,
}: {
  bars: DashboardBar[];
  totalSpent: number;
  currency: string;
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

  // Display: the four largest named slices, everything else as "Other".
  const top = grouped
    .filter((s) => s.name !== "Other")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);
  const rest = totalSpent - top.reduce((sum, s) => sum + s.amount, 0);
  const slices = [...top, ...(rest > 0 ? [{ name: "Other", amount: rest }] : [])].map((s, i) => ({
    ...s,
    color: RAMP[i]!,
  }));

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

  return (
    <section className="card space-y-4 rounded-2xl border border-hairline p-5">
      <h2 className="text-[15px] font-semibold">Where your money goes</h2>
      <div className="flex items-center gap-5">
        <div
          className="relative h-36 w-36 shrink-0"
          role="img"
          aria-label={`Spending breakdown: ${slices.map((s) => `${s.name} ${formatMoney(s.amount, currency)}`).join(", ")}`}
        >
          <svg viewBox={`0 0 ${GRID} ${GRID}`} className="h-full w-full" shapeRendering="crispEdges" aria-hidden>
            {RING.map((cell, i) => (
              <rect
                key={i}
                x={cell.x + 0.09}
                y={cell.y + 0.09}
                width={0.82}
                height={0.82}
                fill={colorAt(i)}
                className="cell"
                style={{ ["--d" as string]: Math.floor(i / 4) }}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="tnum text-[15px] font-semibold leading-tight">{formatMoney(totalSpent, currency)}</p>
            <p className="text-[11px] text-muted">Total</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2.5 text-[13px]">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[1px]" style={{ background: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="tnum shrink-0 text-muted">{Math.round((s.amount / totalSpent) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

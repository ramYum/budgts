import { formatMoney } from "@/lib/budget/money";
import type { Pacing } from "@/lib/budget/pacing";

const FILL: Record<Pacing["pace"], string> = {
  none: "bg-fill-under",
  under: "bg-fill-under",
  on: "bg-fill-near",
  over: "bg-fill-over",
};

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/**
 * Derived daily / weekly spending guidance for the month shown on the
 * dashboard. Not a budget the user manages — a read-only companion to the
 * monthly budget. Renders nothing until there is a budget to pace against, or
 * once the month is over (no days left to guide).
 */
export function PacingCard({ pacing, currency }: { pacing: Pacing; currency: string }) {
  if (pacing.pace === "none" || pacing.daysRemaining === 0) return null;

  const { monthlyBudget, spentToDate, expectedToDate, paceDelta, daysRemaining } = pacing;
  const spentPct = monthlyBudget > 0 ? clampPct((spentToDate / monthlyBudget) * 100) : 0;
  const expectedPct = monthlyBudget > 0 ? clampPct((expectedToDate / monthlyBudget) * 100) : 0;

  const dayLabel = daysRemaining === 1 ? "1 day left" : `${daysRemaining} days left`;

  let caption: { text: string; tone: string } | null = null;
  if (expectedToDate > 0) {
    if (pacing.pace === "over") {
      caption = {
        text: `Over pace — ${formatMoney(paceDelta, currency)} above the line`,
        tone: "text-neg",
      };
    } else if (pacing.pace === "on") {
      caption = { text: "On pace", tone: "text-muted" };
    } else {
      caption = {
        text: `Under pace — ${formatMoney(-paceDelta, currency)} below the line`,
        tone: "text-muted",
      };
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
        Daily pace
      </h2>
      <div className="card space-y-3 rounded-2xl border border-hairline p-4">
        <div className="flex items-baseline justify-between">
          <p className="tnum font-display text-xl font-bold text-text">
            {formatMoney(pacing.dailyAllowance, currency)}{" "}
            <span className="text-sm font-medium text-muted">a day</span>
          </p>
          <p className="text-xs text-muted">{dayLabel}</p>
        </div>

        <div className="relative h-2">
          <div className="absolute inset-0 overflow-hidden rounded-full bg-track">
            <div
              className={`h-full rounded-full ${FILL[pacing.pace]}`}
              style={{ width: `${spentPct}%` }}
            />
          </div>
          {expectedPct > 0 && expectedPct < 100 && (
            <div
              className="absolute -top-0.5 h-3 w-px bg-heading"
              style={{ left: `${expectedPct}%` }}
              aria-hidden
            />
          )}
        </div>

        <div className="flex items-baseline justify-between text-xs">
          <span className="tnum text-muted">
            {formatMoney(pacing.weeklyAllowance, currency)} to spend this week
          </span>
          {caption && <span className={`tnum ${caption.tone}`}>{caption.text}</span>}
        </div>
      </div>
    </section>
  );
}

/**
 * The native Goals view-model: the contract of `GET /api/mobile/goals`. A projection of `loadGoals`
 * (`src/lib/goals/load-goals.ts`, the same reads and progress math the web Goals page renders); every number is copied from
 * `goalProgress` / `goalsSummary`, none is recomputed here. Money is integer minor units.
 *
 * `today` is the user's own date in their stored time zone: the default date for a new contribution (the app never dates
 * anything from the device clock).
 */
import type { GoalProgress, GoalsSummary } from "@/lib/budget/savings";
import type { GoalsData } from "@/lib/goals/load-goals";
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";

export type MobileGoal = GoalProgress;

export type MobileGoals = {
  version: typeof MOBILE_API_VERSION;
  currency: string;
  /** `YYYY-MM-DD` in the user's own time zone. */
  today: string;
  summary: GoalsSummary;
  /** Active goals, oldest first (the web page's order). */
  goals: MobileGoal[];
};

export function buildMobileGoals(data: GoalsData, today: string): MobileGoals {
  return {
    version: MOBILE_API_VERSION,
    currency: data.currency,
    today,
    summary: {
      totalTarget: data.summary.totalTarget,
      totalSaved: data.summary.totalSaved,
      activeCount: data.summary.activeCount,
      completeCount: data.summary.completeCount,
    },
    goals: data.items.map((g) => ({
      id: g.id,
      name: g.name,
      target: g.target,
      saved: g.saved,
      remaining: g.remaining,
      pct: g.pct,
      complete: g.complete,
      targetDate: g.targetDate,
    })),
  };
}

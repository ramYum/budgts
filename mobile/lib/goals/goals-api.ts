import { bool, int, list, obj, optStr, str } from "../api/parse";

/**
 * The response contract of `GET /api/mobile/goals` (server: `buildMobileGoals` in `src/lib/mobile/goals.ts`, over the
 * same `loadGoals` the web Goals page renders). Every figure (saved, remaining, each goal's whole-percent `pct`, the
 * totals) is computed server-side; the app does no financial calculation. Money is integer minor units.
 */
export type MobileGoal = {
  id: string;
  name: string;
  target: number;
  /** may be negative if more was withdrawn than added */
  saved: number;
  remaining: number;
  /** 0..100, whole percent */
  pct: number;
  complete: boolean;
  /** `YYYY-MM-DD` or null */
  targetDate: string | null;
};

export type MobileGoals = {
  currency: string;
  /** The user's own date, `YYYY-MM-DD`: a new contribution's default date. */
  today: string;
  summary: { totalTarget: number; totalSaved: number; activeCount: number; completeCount: number };
  /** Active goals, oldest first (the web page's order). */
  goals: MobileGoal[];
};

export function parseGoals(body: unknown): MobileGoals {
  const b = obj(body, "goals");
  const s = obj(b.summary, "summary");
  return {
    currency: str(b.currency, "currency"),
    today: str(b.today, "today"),
    summary: {
      totalTarget: int(s.totalTarget, "totalTarget"),
      totalSaved: int(s.totalSaved, "totalSaved"),
      activeCount: int(s.activeCount, "activeCount"),
      completeCount: int(s.completeCount, "completeCount"),
    },
    goals: list(b.goals, "goals", (v, i) => {
      const g = obj(v, `goals[${i}]`);
      return {
        id: str(g.id, "id"),
        name: str(g.name, "name"),
        target: int(g.target, "target"),
        saved: int(g.saved, "saved"),
        remaining: int(g.remaining, "remaining"),
        pct: int(g.pct, "pct"),
        complete: bool(g.complete, "complete"),
        targetDate: optStr(g.targetDate, "targetDate"),
      };
    }),
  };
}

/** "2027-04-01" → "Apr 2027" (web goals-view.tsx `formatTargetDate`: a calendar date, read in UTC). */
export function formatTargetDate(date: string, locale?: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
}

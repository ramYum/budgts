import { bool, int, obj, optStr } from "../api/parse";

/**
 * What every signed-in screen shows around its content, the way the web
 * dashboard layout does on every page (`GET /api/mobile/status`, server:
 * `src/lib/mobile/status.ts`): the "Needs a category" bell's count, the bank
 * review warnings, and the account-deletion lock. Each comes from the same
 * shared function the web layout calls, so the two never disagree.
 */
export type MobileStatus = {
  /** bank rows awaiting a category; null when bank connections are switched off */
  needsCategoryCount: number | null;
  /** the bank review warnings, verbatim; both null when nothing is flagged */
  review: { advisory: string | null; excluded: string | null };
  /** a started deletion has locked the account: every screen says it is read-only */
  deletionInProgress: boolean;
};

export function parseStatus(body: unknown): MobileStatus {
  const b = obj(body, "status");
  const review = obj(b.review, "review");
  const count = b.needsCategoryCount === null ? null : int(b.needsCategoryCount, "needsCategoryCount");
  if (count !== null && count < 0) throw new Error("needsCategoryCount: negative");
  return {
    needsCategoryCount: count,
    review: { advisory: optStr(review.advisory, "advisory"), excluded: optStr(review.excluded, "excluded") },
    deletionInProgress: bool(b.deletionInProgress, "deletionInProgress"),
  };
}

/** `GET /api/mobile/hub`: the counts beside the More and Settings rows (server `src/lib/hub-counts.ts`). */
export type MobileHub = { goals: number; accounts: number; banks: number | null; categories: number; budgets: number };

export function parseHub(body: unknown): MobileHub {
  const b = obj(body, "hub");
  return {
    goals: int(b.goals, "goals"),
    accounts: int(b.accounts, "accounts"),
    banks: b.banks === null ? null : int(b.banks, "banks"),
    categories: int(b.categories, "categories"),
    budgets: int(b.budgets, "budgets"),
  };
}

/** "2 goals", "1 bank" (web `plural`, src/lib/hub-counts.ts). */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The bell's accessible name and badge text (web `NeedsCategoryBell`). */
export function bellLabel(count: number): { label: string; badge: string | null } {
  const n = Math.max(0, Math.trunc(count));
  if (n === 0) return { label: "Categories up to date", badge: null };
  return { label: `${n} ${n === 1 ? "transaction needs" : "transactions need"} a category`, badge: n > 9 ? "9+" : String(n) };
}

/**
 * Where the bell goes (web `/transactions#needs-category`): Activity for the user's current month with no category
 * filter, scrolled to "Needs a category". `m` and `category` are sent empty so a month or a category already open on
 * the Activity tab is cleared (Activity ignores an empty value and falls back to the current month); `focus` asks it to
 * scroll to the section (`needs-category`, implemented by Lane D-1).
 */
export const NEEDS_CATEGORY_LINK = {
  pathname: "/activity",
  params: { m: "", category: "", focus: "needs-category" },
} as const;

/**
 * The response contract of `GET /api/mobile/home` (server source of truth:
 * `src/lib/mobile/home.ts`). Mobile is a separate npm root and cannot import
 * it, so the shape is mirrored here — and validated at runtime, so a server
 * change the app doesn't understand becomes a clear error state instead of a
 * blank or wrong screen.
 *
 * The client does NO financial math: every number arrives computed. Money is
 * integer minor units.
 */
export const MOBILE_HOME_VERSION = 1;

export type BudgetState = "under" | "near" | "over";

export type HomeCategory = {
  id: string;
  name: string;
  color: string;
  budget: number;
  actual: number;
  remaining: number;
  pctUsed: number;
  state: BudgetState;
};

export type HomeActivity = {
  id: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  isTransfer: boolean;
  category: { name: string; color: string } | null;
};

/** The one change worth suggesting this month (server: `src/lib/insights/suggestion.ts`); `share` is a whole percent. */
export type HomeSuggestion =
  | { kind: "unbudgeted"; categoryId: string; name: string; amount: number; share: number }
  | { kind: "mover"; categoryId: string; name: string; amount: number; delta: number };

export type MobileHome = {
  version: typeof MOBILE_HOME_VERSION;
  /** The user's current month and today, in their stored time zone. */
  month: string;
  today: string;
  currency: string;
  moneyLeft: number;
  income: number;
  spent: number;
  budgeted: number;
  leftToSpend: number;
  savingsRate: number | null;
  categories: HomeCategory[];
  recent: HomeActivity[];
  savings: { activeCount: number; totalSaved: number; totalTarget: number } | null;
  /** "Get set up": whether any bank connection exists; `null` when bank connections are switched off. */
  bankConnected: boolean | null;
  /** Home's "What can I change?" card; `null` when there is nothing worth suggesting. */
  suggestion: HomeSuggestion | null;
  /** "Where your money goes", largest first; whole-percent shares. Empty when nothing was spent. */
  breakdown: { name: string; amount: number; share: number }[];
  /** Six months of spending, oldest first; the last is the shown month. */
  trend: { month: string; spend: number }[];
  /** The trend card's headline: the month's spending and its change against the previous month. */
  trendChange: { total: number; delta: number | null; previousMonth: string | null };
  /** The active expense categories, in the web Home's order: the chips of a month with no spending, the set-up count. */
  expenseCategories: { id: string; name: string }[];
};

export class HomeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomeContractError";
  }
}

function fail(what: string): never {
  throw new HomeContractError(`Unexpected Home response: ${what}`);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function int(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  return isInt(v) ? v : fail(`${key} is not an integer`);
}
function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return isStr(v) ? v : fail(`${key} is not a string`);
}

function parseCategory(v: unknown): HomeCategory {
  if (!isObj(v)) return fail("category is not an object");
  const state = v.state;
  if (state !== "under" && state !== "near" && state !== "over") return fail("category.state");
  return {
    id: str(v, "id"),
    name: str(v, "name"),
    color: str(v, "color"),
    budget: int(v, "budget"),
    actual: int(v, "actual"),
    remaining: int(v, "remaining"),
    pctUsed: int(v, "pctUsed"),
    state,
  };
}

function parseActivity(v: unknown): HomeActivity {
  if (!isObj(v)) return fail("activity is not an object");
  const direction = v.direction;
  if (direction !== "debit" && direction !== "credit") return fail("activity.direction");
  const cat = v.category;
  let category: HomeActivity["category"] = null;
  if (cat !== null && cat !== undefined) {
    if (!isObj(cat)) return fail("activity.category");
    category = { name: str(cat, "name"), color: str(cat, "color") };
  }
  if (typeof v.isTransfer !== "boolean") return fail("activity.isTransfer");
  return {
    id: str(v, "id"),
    description: str(v, "description"),
    amount: int(v, "amount"),
    direction,
    occurredAt: str(v, "occurredAt"),
    isTransfer: v.isTransfer,
    category,
  };
}

function parseSuggestion(v: unknown): HomeSuggestion | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) return fail("suggestion");
  const base = { categoryId: str(v, "categoryId"), name: str(v, "name"), amount: int(v, "amount") };
  if (v.kind === "unbudgeted") return { kind: "unbudgeted", ...base, share: int(v, "share") };
  if (v.kind === "mover") return { kind: "mover", ...base, delta: int(v, "delta") };
  return fail("suggestion.kind");
}

function parseTrendChange(v: unknown): MobileHome["trendChange"] {
  if (!isObj(v)) return fail("trendChange");
  const delta = v.delta;
  if (delta !== null && !isInt(delta)) return fail("trendChange.delta");
  const prev = v.previousMonth;
  if (prev !== null && !isStr(prev)) return fail("trendChange.previousMonth");
  return { total: int(v, "total"), delta, previousMonth: prev };
}

/** Validates an untrusted JSON body into a `MobileHome`, or throws `HomeContractError`. */
export function parseMobileHome(input: unknown): MobileHome {
  if (!isObj(input)) return fail("body is not an object");
  if (input.version !== MOBILE_HOME_VERSION) return fail(`unsupported version ${String(input.version)}`);

  const month = str(input, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("month");

  const rate = input.savingsRate;
  if (rate !== null && (typeof rate !== "number" || !Number.isFinite(rate))) return fail("savingsRate");

  if (!Array.isArray(input.categories)) return fail("categories is not an array");
  if (!Array.isArray(input.recent)) return fail("recent is not an array");

  let savings: MobileHome["savings"] = null;
  if (input.savings !== null && input.savings !== undefined) {
    if (!isObj(input.savings)) return fail("savings");
    savings = {
      activeCount: int(input.savings, "activeCount"),
      totalSaved: int(input.savings, "totalSaved"),
      totalTarget: int(input.savings, "totalTarget"),
    };
  }

  const bank = input.bankConnected;
  if (bank !== null && typeof bank !== "boolean") return fail("bankConnected");

  return {
    version: MOBILE_HOME_VERSION,
    month,
    today: str(input, "today"),
    currency: str(input, "currency"),
    moneyLeft: int(input, "moneyLeft"),
    income: int(input, "income"),
    spent: int(input, "spent"),
    budgeted: int(input, "budgeted"),
    leftToSpend: int(input, "leftToSpend"),
    savingsRate: rate,
    categories: input.categories.map(parseCategory),
    recent: input.recent.map(parseActivity),
    savings,
    bankConnected: bank,
    suggestion: parseSuggestion(input.suggestion),
    breakdown: Array.isArray(input.breakdown)
      ? input.breakdown.map((b) => (isObj(b) ? { name: str(b, "name"), amount: int(b, "amount"), share: int(b, "share") } : fail("breakdown")))
      : fail("breakdown is not an array"),
    trend: Array.isArray(input.trend)
      ? input.trend.map((t) => (isObj(t) ? { month: str(t, "month"), spend: int(t, "spend") } : fail("trend")))
      : fail("trend is not an array"),
    trendChange: parseTrendChange(input.trendChange),
    expenseCategories: Array.isArray(input.expenseCategories)
      ? input.expenseCategories.map((c) => (isObj(c) ? { id: str(c, "id"), name: str(c, "name") } : fail("expenseCategories")))
      : fail("expenseCategories is not an array"),
  };
}

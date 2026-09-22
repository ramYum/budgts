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

export type MobileHome = {
  version: typeof MOBILE_HOME_VERSION;
  month: string;
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

  return {
    version: MOBILE_HOME_VERSION,
    month,
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
  };
}

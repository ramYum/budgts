/**
 * Maps a Plaid `personal_finance_category` to one of the user's Budgts
 * categories — deterministically, no ML. The map is intentionally
 * conservative: only high-confidence, unambiguous primaries are mapped;
 * everything else resolves to `null` ("leave uncategorized"), which lands the
 * transaction in the "Needs a category" list rather than mis-filing it.
 *
 * Design §18. A `merchant_entity_id` override (per-user memory) is consulted
 * BEFORE this map by the caller (Step: categorization + merchant-rule memory).
 */

/** Thrown for a `personal_finance_category.primary` this map doesn't recognise. */
export class UnknownPfcPrimaryError extends Error {
  constructor(readonly primary: string) {
    super(`unrecognised Plaid personal_finance_category.primary: ${primary}`);
    this.name = "UnknownPfcPrimaryError";
  }
}

/**
 * Every Plaid PFC primary (taxonomy as of Plaid-Version 2020-09-14). The value
 * is the Budgts seed category NAME, or `null` to leave uncategorized. Keeping
 * the table exhaustive means a new Plaid taxonomy value throws instead of
 * silently mapping to null.
 */
const PRIMARY_TO_CATEGORY_NAME: Record<string, string | null> = {
  INCOME: "Salary", // refined by detailed below (wages vs other)
  TRANSFER_IN: null, // handled as is_transfer; never categorised
  TRANSFER_OUT: null,
  LOAN_PAYMENTS: null, // mortgage vs car vs student — user decides
  BANK_FEES: null,
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Food / Groceries",
  GENERAL_MERCHANDISE: null, // too broad (clothes, electronics, ...)
  HOME_IMPROVEMENT: "Housing",
  MEDICAL: null,
  PERSONAL_CARE: "Personal Care",
  GENERAL_SERVICES: null,
  GOVERNMENT_AND_NON_PROFIT: null,
  TRANSPORTATION: "Transportation",
  TRAVEL: "Transportation",
  RENT_AND_UTILITIES: "Housing",
};

const LOW_CONFIDENCE = new Set(["LOW", "UNKNOWN"]);

/** Normalise a category name for matching ("Food / Groceries" ~ "food/groceries"). */
export function categoryKey(name: string): string {
  return name.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

export interface CategoryLookup {
  /** `categoryKey(name)` → category id, for the user's expense + income categories. */
  byKey: ReadonlyMap<string, string>;
}

/** Build a {@link CategoryLookup} from `[name, id]` pairs. */
export function buildCategoryLookup(pairs: Iterable<readonly [string, string]>): CategoryLookup {
  const byKey = new Map<string, string>();
  for (const [name, id] of pairs) byKey.set(categoryKey(name), id);
  return { byKey };
}

/**
 * @returns the resolved Budgts category id, or `null` to leave uncategorized.
 * @throws {UnknownPfcPrimaryError} if `primary` is non-null and not in the taxonomy.
 */
export function resolvePlaidCategory(
  primary: string | null,
  detailed: string | null,
  confidence: string | null,
  lookup: CategoryLookup,
): string | null {
  if (!primary) return null;
  if (!(primary in PRIMARY_TO_CATEGORY_NAME)) throw new UnknownPfcPrimaryError(primary);
  if (confidence && LOW_CONFIDENCE.has(confidence)) return null;

  let name = PRIMARY_TO_CATEGORY_NAME[primary];
  if (primary === "INCOME") {
    // INCOME_WAGES → Salary; any other income → Other Income.
    name = detailed === "INCOME_WAGES" ? "Salary" : "Other Income";
  }
  if (name === null) return null;
  return lookup.byKey.get(categoryKey(name)) ?? null;
}

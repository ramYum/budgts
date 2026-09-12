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

/**
 * Plaid PFC `detailed` subtypes specific enough that the subtype alone maps 1:1
 * to a Budgts seed category — so we trust it **regardless of Plaid's
 * `confidence_level`** (resolver R3, design §18). This is NOT lowering the
 * global threshold: `resolvePlaidCategory` (the primary-only fallback, R4)
 * keeps its `LOW`/`UNKNOWN` gate. Conservative core only — deliberately omits
 * the fuzzy ones (`FOOD_AND_DRINK_RESTAURANT`, `RENT_AND_UTILITIES_RENT`,
 * `INCOME_WAGES`). Taxonomy pinned to Plaid-Version 2020-09-14.
 */
const TRUSTED_DETAILED: Record<string, string> = {
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Transportation",
  TRANSPORTATION_PUBLIC_TRANSIT: "Transportation",
  TRANSPORTATION_GAS: "Transportation",
  TRANSPORTATION_PARKING: "Transportation",
  TRANSPORTATION_TOLLS: "Transportation",
  TRANSPORTATION_BIKES_AND_SCOOTERS: "Transportation",
  FOOD_AND_DRINK_FAST_FOOD: "Food / Groceries",
  FOOD_AND_DRINK_COFFEE: "Food / Groceries",
  FOOD_AND_DRINK_GROCERIES: "Food / Groceries",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Housing",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Housing",
  RENT_AND_UTILITIES_TELEPHONE: "Housing",
  RENT_AND_UTILITIES_WATER: "Housing",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE: "Housing",
  ENTERTAINMENT_TV_AND_MOVIES: "Entertainment",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Entertainment",
  ENTERTAINMENT_VIDEO_GAMES: "Entertainment",
  PERSONAL_CARE_HAIR_AND_BEAUTY: "Personal Care",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Personal Care",
};

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

/**
 * Resolver R3 (design §18): resolve a **trusted** Plaid PFC `detailed` subtype
 * to a Budgts category id, ignoring `confidence_level`. Returns `null` for an
 * unknown / untrusted `detailed` (never throws) and for a user missing that
 * seed category — same graceful-degrade contract as {@link resolvePlaidCategory}.
 */
export function resolveTrustedDetailed(detailed: string | null, lookup: CategoryLookup): string | null {
  if (!detailed) return null;
  const name = TRUSTED_DETAILED[detailed];
  return name ? (lookup.byKey.get(categoryKey(name)) ?? null) : null;
}

/** The `detailed` subtypes {@link resolveTrustedDetailed} trusts — exported for tests. */
export const TRUSTED_DETAILED_KEYS: readonly string[] = Object.keys(TRUSTED_DETAILED);

/**
 * A **suggestion**, not a resolution: reuses {@link resolvePlaidCategory}'s own
 * mapping table but ignores `confidence_level` entirely, so it can surface a
 * category for a merchant Plaid flagged too weakly to auto-apply. Callers MUST
 * still require the user to confirm — this never writes a category on its own.
 * Returns `null` for a primary the table doesn't map to any category (e.g.
 * `GENERAL_MERCHANDISE`) — those stay genuinely ambiguous regardless of
 * confidence, so no suggestion is better than a guess.
 */
export function suggestPlaidCategory(
  primary: string | null,
  detailed: string | null,
  lookup: CategoryLookup,
): string | null {
  try {
    return resolvePlaidCategory(primary, detailed, null, lookup);
  } catch {
    return null;
  }
}

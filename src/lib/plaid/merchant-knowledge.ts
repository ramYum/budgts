/**
 * Budgts merchant knowledge — a small, hand-curated, deterministic map from a
 * **normalized merchant name** (see {@link normalizeMerchantName}) to one of the
 * user's seed category NAMES. Design §18, resolver R2.
 *
 * This is how obvious household-name merchants (Uber, McDonald's, Netflix, …)
 * get categorized on first import even when Plaid reports LOW confidence — it
 * runs *before* the Plaid PFC layers and ignores Plaid's confidence entirely.
 *
 * Inclusion bar (strict): a merchant is listed ONLY if ~every consumer
 * transaction for it maps to exactly one seed category. Marketplaces, "super"
 * stores, and payment rails (Amazon, Walmart, Target, PayPal, Venmo, …) are
 * deliberately EXCLUDED — an ambiguous merchant belongs in "Needs a category",
 * or gets a per-user rule after one correction. Do not add merchants to shrink
 * that list.
 *
 * Keys are authored already-normalized; a test asserts
 * `normalizeMerchantName(key) === key` and that every value is a seed name.
 * Bump {@link KNOWLEDGE_VERSION} on any change.
 */
import type { CategoryLookup } from "./category-map";
import { categoryKey } from "./category-map";

export const KNOWLEDGE_VERSION = 1;

/** Values are seed category names only. Resolution goes name → CategoryLookup. */
const ENTRIES: ReadonlyArray<readonly [category: string, names: readonly string[]]> = [
  [
    "Transportation",
    [
      // ride-share / taxi
      "uber",
      "uber trip",
      "lyft",
      "curb",
      // fuel / oil-company brands
      "shell",
      "chevron",
      "exxon",
      "exxonmobil",
      "mobil",
      "bp",
      "arco",
      "valero",
      "sunoco",
      "marathon petroleum",
      "phillips 66",
      "conoco",
      "texaco",
      "citgo",
      "gulf oil",
      "circle k",
      "speedway",
      "quiktrip",
      "76",
    ],
  ],
  [
    "Entertainment",
    [
      "netflix",
      "spotify",
      "hulu",
      "disney plus",
      "hbo max",
      "hbo",
      "paramount plus",
      "peacock",
      "peacock tv",
      "youtube premium",
      "youtube tv",
      "apple music",
      "audible",
      "siriusxm",
      "pandora",
      "crunchyroll",
      "steam games",
      "playstation network",
      "xbox game pass",
      "nintendo",
      "patreon",
      "twitch",
      "amc theatres",
      "amc theaters",
      "regal cinemas",
      "cinemark",
      "fandango",
      "ticketmaster",
    ],
  ],
  [
    "Food / Groceries",
    [
      // fast food / coffee chains
      "mcdonalds",
      "starbucks",
      "dunkin",
      "dunkin donuts",
      "chipotle",
      "taco bell",
      "subway",
      "wendys",
      "burger king",
      "chick fil a",
      "panera bread",
      "dominos",
      "dominos pizza",
      "pizza hut",
      "papa johns",
      "little caesars",
      "kfc",
      "popeyes",
      "five guys",
      "shake shack",
      "sweetgreen",
      "dutch bros",
      "tim hortons",
      "whataburger",
      "jack in the box",
      "arbys",
      "jimmy johns",
      "wingstop",
      "raising canes",
      "culvers",
      "panda express",
      "dairy queen",
      "krispy kreme",
      "peets coffee",
      "caribou coffee",
      "blue bottle coffee",
      // food-delivery (dominant use is restaurant food)
      "uber eats",
      "doordash",
      "door dash",
      "grubhub",
      "postmates",
      // grocery chains
      "safeway",
      "kroger",
      "aldi",
      "trader joes",
      "whole foods",
      "whole foods market",
      "publix",
      "wegmans",
      "sprouts",
      "food lion",
      "h e b",
      "heb",
      "ralphs",
      "vons",
      "albertsons",
      "meijer",
      "winco foods",
      "king soopers",
      "lidl",
    ],
  ],
  [
    "Housing",
    [
      // internet / cable / telecom
      "comcast",
      "xfinity",
      "spectrum",
      "cox communications",
      "centurylink",
      "frontier communications",
      "at t",
      "verizon",
      "verizon wireless",
      "t mobile",
      "us cellular",
      "google fi",
      "mint mobile",
      "cricket wireless",
      // electric / gas / water utilities (the largest, name-unambiguous ones)
      "pg e",
      "pacific gas electric",
      "southern california edison",
      "con edison",
      "duke energy",
      "national grid",
      "dominion energy",
      "xcel energy",
      "dte energy",
      "georgia power",
      "florida power light",
      // waste
      "waste management",
      "republic services",
    ],
  ],
  [
    "Personal Care",
    [
      // gyms / fitness studios
      "planet fitness",
      "la fitness",
      "equinox",
      "24 hour fitness",
      "orangetheory fitness",
      "crunch fitness",
      "anytime fitness",
      "golds gym",
      "lifetime fitness",
      "life time",
      "blink fitness",
      "club pilates",
      "corepower yoga",
      // salon / beauty
      "great clips",
      "supercuts",
      "sport clips",
      "sportclips",
      "ulta beauty",
      "sephora",
      "european wax center",
      "drybar",
      "sally beauty",
      "hair cuttery",
    ],
  ],
  [
    "Insurances",
    [
      // property & casualty insurers (a transaction here is ~always a premium)
      "geico",
      "progressive",
      "progressive insurance",
      "state farm",
      "allstate",
      "liberty mutual",
      "farmers insurance",
      "the general",
      "root insurance",
      "lemonade insurance",
      "esurance",
    ],
  ],
];

/** normalized merchant name → seed category NAME. */
export const MERCHANT_KNOWLEDGE: ReadonlyMap<string, string> = new Map(
  ENTRIES.flatMap(([category, names]) => names.map((n) => [n, category] as const)),
);

/**
 * Resolve a normalized merchant name to a Budgts category **id** for this user,
 * or `null` (no entry, or the user has no category with that seed name — same
 * graceful-degrade contract as `resolvePlaidCategory`).
 */
export function resolveMerchantKnowledge(nameKey: string, lookup: CategoryLookup): string | null {
  if (!nameKey) return null;
  const name = MERCHANT_KNOWLEDGE.get(nameKey);
  return name ? (lookup.byKey.get(categoryKey(name)) ?? null) : null;
}

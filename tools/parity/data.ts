/**
 * The parity users' fixed ledgers: plain data, no money math. Every amount is a literal typed the way a person types it
 * into the app's own forms ("12.34"), every date a fixed day of a month counted back from the user's current month, so two
 * seeds in the same month produce the same screens. The app's own commands turn these into rows (tools/parity/seed.ts).
 */

export type ParityUserName = "firstrun" | "tour" | "empty" | "full" | "over" | "banks" | "deleting";

export const PARITY_USERS: readonly ParityUserName[] = ["firstrun", "tour", "empty", "full", "over", "banks", "deleting"];

/** Every parity user's email: a reserved, undeliverable domain, so nothing is ever sent anywhere. */
export function parityEmail(name: ParityUserName): string {
  return `parity+${name}@budgts.test`;
}

/** Every parity user lives here, with this currency (fixed so the web and the device agree). */
export const PARITY_TIME_ZONE = "America/New_York";
export const PARITY_CURRENCY = "USD";

export type AccountKey = "checking" | "card" | "savings";

export const ACCOUNTS: ReadonlyArray<{ key: AccountKey; name: string; type: "checking" | "credit" | "savings" }> = [
  { key: "checking", name: "Everyday checking", type: "checking" },
  { key: "card", name: "Travel card", type: "credit" },
  { key: "savings", name: "Rainy-day savings", type: "savings" },
];

/** Created through the category command (a custom category: it shows the tag icon, as a user's own would). */
export const CUSTOM_CATEGORIES = [{ name: "Dining out", kind: "expense" as const }];

/** Exactly 40 characters: the long-merchant case (Review Focus 3). */
export const LONG_MERCHANT = "The Neighborhood Corner Market and Deli!";

export type SeedTxn = {
  /** months before the user's current month (0 = this month) */
  monthsBack: number;
  day: number;
  account: AccountKey;
  /** a category name, or null for "Uncategorized" */
  category: string | null;
  amount: string;
  direction: "debit" | "credit";
  description: string;
  isTransfer?: boolean;
};

const G = "Food / Groceries";
const D = "Dining out";

/** This month: 42 rows, incl. income on the 1st and 15th, a transfer pair, a refund and the 40-character merchant. */
const THIS_MONTH: SeedTxn[] = [
  { monthsBack: 0, day: 1, account: "checking", category: "Salary", amount: "3250.00", direction: "credit", description: "Acme Corp payroll" },
  { monthsBack: 0, day: 15, account: "checking", category: "Salary", amount: "3250.00", direction: "credit", description: "Acme Corp payroll" },
  { monthsBack: 0, day: 21, account: "checking", category: "Other Income", amount: "85.00", direction: "credit", description: "Marketplace sale" },
  { monthsBack: 0, day: 1, account: "checking", category: "Housing", amount: "1850.00", direction: "debit", description: "Maple Street Apartments" },
  { monthsBack: 0, day: 5, account: "checking", category: null, amount: "500.00", direction: "debit", description: "Transfer to Rainy-day savings", isTransfer: true },
  { monthsBack: 0, day: 5, account: "savings", category: null, amount: "500.00", direction: "credit", description: "Transfer from Everyday checking", isTransfer: true },
  { monthsBack: 0, day: 2, account: "checking", category: G, amount: "84.12", direction: "debit", description: "Green Valley Grocer" },
  { monthsBack: 0, day: 6, account: "checking", category: G, amount: "62.40", direction: "debit", description: "Fresh Fields Market" },
  { monthsBack: 0, day: 9, account: "card", category: G, amount: "71.35", direction: "debit", description: "Green Valley Grocer" },
  { monthsBack: 0, day: 12, account: "checking", category: G, amount: "48.90", direction: "debit", description: "Corner Bakery" },
  { monthsBack: 0, day: 16, account: "checking", category: G, amount: "93.27", direction: "debit", description: "Fresh Fields Market" },
  { monthsBack: 0, day: 19, account: "card", category: G, amount: "55.61", direction: "debit", description: "Green Valley Grocer" },
  { monthsBack: 0, day: 23, account: "checking", category: G, amount: "67.08", direction: "debit", description: "Fresh Fields Market" },
  { monthsBack: 0, day: 27, account: "checking", category: G, amount: "38.27", direction: "debit", description: "Corner Bakery" },
  { monthsBack: 0, day: 25, account: "checking", category: G, amount: "31.00", direction: "debit", description: LONG_MERCHANT },
  { monthsBack: 0, day: 3, account: "card", category: D, amount: "42.80", direction: "debit", description: "Luigi's Trattoria" },
  { monthsBack: 0, day: 4, account: "checking", category: D, amount: "12.45", direction: "debit", description: "Bean There Coffee" },
  { monthsBack: 0, day: 7, account: "card", category: D, amount: "36.20", direction: "debit", description: "Sakura Sushi" },
  { monthsBack: 0, day: 10, account: "checking", category: D, amount: "9.75", direction: "debit", description: "Bean There Coffee" },
  { monthsBack: 0, day: 13, account: "card", category: D, amount: "58.40", direction: "debit", description: "The Oak Grill" },
  { monthsBack: 0, day: 14, account: "checking", category: D, amount: "18.60", direction: "debit", description: "Taco Corner" },
  { monthsBack: 0, day: 17, account: "card", category: D, amount: "64.25", direction: "debit", description: "Luigi's Trattoria" },
  { monthsBack: 0, day: 18, account: "card", category: D, amount: "24.50", direction: "credit", description: "Refund: Luigi's Trattoria" },
  { monthsBack: 0, day: 20, account: "checking", category: D, amount: "11.30", direction: "debit", description: "Bean There Coffee" },
  { monthsBack: 0, day: 22, account: "card", category: D, amount: "47.90", direction: "debit", description: "Sakura Sushi" },
  { monthsBack: 0, day: 24, account: "checking", category: D, amount: "22.35", direction: "debit", description: "Taco Corner" },
  { monthsBack: 0, day: 26, account: "card", category: D, amount: "29.70", direction: "debit", description: "Noodle Bar" },
  { monthsBack: 0, day: 8, account: "checking", category: "Transportation", amount: "45.00", direction: "debit", description: "City Transit pass" },
  { monthsBack: 0, day: 11, account: "card", category: "Transportation", amount: "52.18", direction: "debit", description: "Shell station" },
  { monthsBack: 0, day: 16, account: "checking", category: "Transportation", amount: "18.40", direction: "debit", description: "RideShare" },
  { monthsBack: 0, day: 22, account: "card", category: "Transportation", amount: "48.77", direction: "debit", description: "Shell station" },
  { monthsBack: 0, day: 28, account: "checking", category: "Transportation", amount: "23.90", direction: "debit", description: "RideShare" },
  { monthsBack: 0, day: 6, account: "card", category: "Entertainment", amount: "15.99", direction: "debit", description: "StreamFlix" },
  { monthsBack: 0, day: 12, account: "card", category: "Entertainment", amount: "32.00", direction: "debit", description: "Riverside Cinema" },
  { monthsBack: 0, day: 19, account: "checking", category: "Entertainment", amount: "10.99", direction: "debit", description: "SoundWave Music" },
  { monthsBack: 0, day: 24, account: "card", category: "Entertainment", amount: "48.50", direction: "debit", description: "City Bowl" },
  { monthsBack: 0, day: 7, account: "checking", category: "Personal Care", amount: "28.00", direction: "debit", description: "Main Street Barber" },
  { monthsBack: 0, day: 15, account: "card", category: "Personal Care", amount: "19.84", direction: "debit", description: "Wellness Pharmacy" },
  { monthsBack: 0, day: 27, account: "checking", category: "Personal Care", amount: "42.00", direction: "debit", description: "Glow Spa" },
  { monthsBack: 0, day: 3, account: "checking", category: "Insurances", amount: "128.40", direction: "debit", description: "Safe Harbor Insurance" },
  { monthsBack: 0, day: 20, account: "checking", category: null, amount: "27.60", direction: "debit", description: "Hardware Depot" },
  { monthsBack: 0, day: 9, account: "card", category: "Transportation", amount: "14.00", direction: "debit", description: "Downtown Parking" },
];

/** Five prior months, eight rows each, amounts varied per month so the six-month trend has shape. */
function priorMonth(monthsBack: number): SeedTxn[] {
  const g = ["412.30", "388.15", "455.60", "367.90", "430.25"][monthsBack - 1];
  const d = ["186.40", "241.75", "158.20", "302.10", "214.65"][monthsBack - 1];
  const t = ["96.50", "121.30", "88.75", "134.20", "105.60"][monthsBack - 1];
  return [
    { monthsBack, day: 1, account: "checking", category: "Salary", amount: "3250.00", direction: "credit", description: "Acme Corp payroll" },
    { monthsBack, day: 15, account: "checking", category: "Salary", amount: "3250.00", direction: "credit", description: "Acme Corp payroll" },
    { monthsBack, day: 1, account: "checking", category: "Housing", amount: "1850.00", direction: "debit", description: "Maple Street Apartments" },
    { monthsBack, day: 8, account: "checking", category: G, amount: g, direction: "debit", description: "Green Valley Grocer" },
    { monthsBack, day: 12, account: "card", category: D, amount: d, direction: "debit", description: "Luigi's Trattoria" },
    { monthsBack, day: 14, account: "card", category: "Transportation", amount: t, direction: "debit", description: "Shell station" },
    { monthsBack, day: 18, account: "card", category: "Entertainment", amount: "15.99", direction: "debit", description: "StreamFlix" },
    { monthsBack, day: 22, account: "checking", category: "Insurances", amount: "128.40", direction: "debit", description: "Safe Harbor Insurance" },
  ];
}

export const TRANSACTIONS: readonly SeedTxn[] = [...THIS_MONTH, ...[1, 2, 3, 4, 5].flatMap(priorMonth)];

/**
 * This month's budgets on six categories (Insurances left unbudgeted). `over` differs only in two amounts: this month's
 * Dining out rows are $353.70 of debits less a $24.50 refund ($329.20) and Groceries $552.00, so a $253 Dining out budget reads
 * about 130% and a $600 Groceries budget 92% (the app computes the figures; these are only the typed budget amounts).
 */
export function budgets(variant: "full" | "over"): ReadonlyArray<{ category: string; amount: string }> {
  return [
    { category: "Housing", amount: "1900" },
    { category: G, amount: variant === "over" ? "600" : "800" },
    { category: D, amount: variant === "over" ? "253" : "500" },
    { category: "Transportation", amount: "300" },
    { category: "Entertainment", amount: "150" },
    { category: "Personal Care", amount: "120" },
  ];
}

/** Two goals: one near its target, one with a 13+ character target figure (the `figureSize` step-down). */
export const GOALS: ReadonlyArray<{
  name: string;
  target: string;
  contributions: ReadonlyArray<{ monthsBack: number; day: number; amount: string }>;
}> = [
  {
    name: "Emergency fund",
    target: "5000",
    contributions: [
      { monthsBack: 3, day: 2, amount: "1500.00" },
      { monthsBack: 2, day: 2, amount: "1500.00" },
      { monthsBack: 1, day: 2, amount: "1150.00" },
      { monthsBack: 0, day: 2, amount: "500.00" },
    ],
  },
  {
    name: "Dream home",
    target: "1234567.89",
    contributions: [{ monthsBack: 0, day: 3, amount: "12500.00" }],
  },
];

/** `YYYY-MM` shifted back `n` months (calendar arithmetic on the key, no clock). */
export function monthsBefore(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) - n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The ISO date of `day` in the month `monthsBack` before `month`. */
export function seedDate(month: string, monthsBack: number, day: number): string {
  return `${monthsBefore(month, monthsBack)}-${String(day).padStart(2, "0")}`;
}

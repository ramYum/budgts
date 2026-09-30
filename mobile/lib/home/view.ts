import type { TypeRoleName } from "../brand/shared";
import type { MobileHome } from "./contract";

/**
 * Home's presentation decisions, lifted out of the web's `dashboard-view.tsx`
 * so they are tested in one place. None of this is money math: every figure
 * arrives computed in `MobileHome`; these only choose which block shows,
 * which sentence reads, which type size fits, and in what order the blocks
 * rise in.
 */

/**
 * A friendly first name from a sign-in email (web `src/lib/user/display-name.ts`, same rule; view.test.ts checks the two
 * agree). Metro serves the app only the web's brand and Crystal folders, so the one-line rule is mirrored here.
 */
export function displayName(email: string | null | undefined): string {
  const handle = ((email ?? "").split("@")[0] ?? "").split(/[+._-]/)[0] ?? "";
  return handle ? `${handle[0]!.toUpperCase()}${handle.slice(1)}` : "";
}

/** "Good morning" by the device's own hour (web `greetingForHour`, src/lib/local-date.ts; checked equal in view.test.ts). */
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Good afternoon, Alex." as the words that rise in one by one (web `Greeting`). */
export function greetingWords(hour: number, name: string): string[] {
  return `${greetingForHour(hour)}${name ? `, ${name}` : ""}.`.split(" ");
}

/** The hero figure's size: a figure longer than 13 characters steps down so it never wraps (web `figureSize`). */
export function figureVariant(text: string): TypeRoleName {
  return text.length <= 13 ? "tNumXl" : "tNumLg";
}

/** Nothing in or out yet this month: a new account, or a month just begun. */
export const isQuiet = (h: Pick<MobileHome, "income" | "spent">) => h.income === 0 && h.spent === 0;

/** The line under the greeting. */
export function subtitle(h: Pick<MobileHome, "income" | "spent" | "savingsRate">): string {
  if (isQuiet(h)) return "Let's get your month set up.";
  return h.savingsRate !== null && h.savingsRate >= 0 ? "You're doing well this month." : "Let's see where things stand.";
}

/** Which sentence sits under Money left. */
export type HeroLine = "quiet" | "no-income" | "negative" | "kept";

export function heroLine(h: Pick<MobileHome, "income" | "spent" | "savingsRate" | "moneyLeft">): HeroLine {
  if (isQuiet(h)) return "quiet";
  if (h.savingsRate === null) return "no-income";
  return h.moneyLeft < 0 ? "negative" : "kept";
}

/** The hero bar's lit share: the server's savings rate as a percentage, nothing lit when it is negative or absent. */
export const keptPct = (savingsRate: number | null) => (savingsRate === null ? 0 : Math.max(0, savingsRate * 100));

/** The budgets add up to more than has come in (and the month isn't empty): the dismissible warning above the hero. */
export const showsOverAlert = (h: Pick<MobileHome, "budgeted" | "income" | "spent">) => h.budgeted > h.income && !isQuiet(h);

/** The goals' badge: the server's progress rounded to a whole percent, none without a target (web savings card). */
export const savingsBadge = (s: NonNullable<MobileHome["savings"]>) => (s.totalTarget > 0 ? `${Math.round(s.pct)}%` : null);

/** One "Where it went" row's bottom line, left side. */
export type WhereNote = "unplanned" | "over" | "left" | "no-budget";

export function whereNote(c: { budget: number; actual: number; state: string }): WhereNote {
  if (c.budget <= 0 && c.actual > 0) return "unplanned";
  if (c.state === "over" && c.budget > 0) return "over";
  return c.budget > 0 ? "left" : "no-budget";
}

/**
 * The blocks under the header and the `i` each rises with. The web numbers its
 * <Reveal> blocks in source order, which on a phone is not reading order (the
 * trend card is numbered before "What can I change?"), so the numbers here
 * follow the web's source exactly, not the screen.
 */
export type HomeBlocks = {
  overAlert: number | null;
  hero: number;
  setup: number | null;
  where: number;
  trend: number | null;
  change: number | null;
  savings: number | null;
  recent: number;
  breakdown: number | null;
};

export function homeBlocks(
  h: Pick<MobileHome, "income" | "spent" | "budgeted" | "savings" | "suggestion" | "bankConnected">,
): HomeBlocks {
  let order = 1;
  const next = () => order++;
  const quiet = isQuiet(h);
  const overAlert = showsOverAlert(h) ? next() : null;
  const hero = next();
  const setup = quiet && setupDone(h) < setupCount(h) ? next() : null;
  const where = next();
  const trend = !quiet ? next() : null;
  const change = h.suggestion ? next() : null;
  const savings = h.savings ? next() : null;
  const recent = next();
  const breakdown = h.spent > 0 ? next() : null;
  return { overAlert, hero, setup, where, trend, change, savings, recent, breakdown };
}

/** "Get set up": the bank step shows only while bank connections are on (web `SetupState`). */
export const setupCount = (h: Pick<MobileHome, "bankConnected">) => (h.bankConnected === null ? 2 : 3);

export const setupDone = (h: Pick<MobileHome, "bankConnected" | "income" | "budgeted">) =>
  (h.bankConnected === true ? 1 : 0) + (h.income > 0 ? 1 : 0) + (h.budgeted > 0 ? 1 : 0);

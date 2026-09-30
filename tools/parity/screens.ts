/**
 * The parity registry: every screen the check compares, where it lives on each side, the states it is captured in, and
 * the shared test-id contract. The web sets these ids as `data-testid` (Task P2); the native atoms set the same string as
 * `testID` (Android exposes it as the view's resource-id, which Maestro's hierarchy reports). Plan:
 * phase3-plan.md → "Parity tooling lane (P)". Change an id here and on both sides together.
 */
import { ROLE } from "../../src/lib/brand/tokens";
import type { ParityUserName } from "./data";

/* ─── Devices ───────────────────────────────────────────────────────────── */

export type DeviceId = "android-412" | "iphone-390";

export const DEVICES: Record<DeviceId, { width: number; height: number; scale: number; mobileUA: "android" | "ios" }> = {
  // Primary: the parity AVD (1080×2400 px at 420 dpi). 1080 / 2.625 = 411.43 dp, so the device is 0.57 dp narrower than
  // the web's 412 CSS px; geometry allows 1 pt and the pixel diff compares the shared area (see compare.ts).
  "android-412": { width: 412, height: 915, scale: 2.625, mobileUA: "android" },
  "iphone-390": { width: 390, height: 844, scale: 3, mobileUA: "ios" },
};

/* ─── States ────────────────────────────────────────────────────────────── */

/**
 * A state is a seeded user, optionally with a fault: `hold` (the request never resolves → the skeleton), `fail` (the
 * request answers 503 → the error state), `offline`. On the web, `hold` and `fail` are the dev-only harness
 * routes (`/parity-harness/loading|error`); on the device they are the `?hold=` / `?fail=` dev deep-link params.
 */
export type StateId =
  | "firstrun"
  | "tour"
  | "empty"
  | "full"
  | "over"
  | "banks"
  | "deleting"
  | "loading"
  | "error"
  | "notfound"
  | "offline"
  | "signedout";

export const STATE_USER: Record<StateId, ParityUserName | null> = {
  firstrun: "firstrun",
  tour: "tour",
  empty: "empty",
  full: "full",
  over: "over",
  banks: "banks",
  deleting: "deleting",
  loading: "full",
  error: "full",
  notfound: "full",
  offline: null,
  signedout: null,
};

/* ─── The test-id contract ──────────────────────────────────────────────── */

/**
 * Shared ids. Repeated components (rows, bars, tiles) carry the same id on every instance; the capture numbers them in
 * document order (`progress-bar#3`), and so must the native tree (both are depth-first, top to bottom).
 */
export const TESTIDS = {
  shell: [
    "app-header", // phone header bar (layout.tsx) · native AppHeader
    "app-logo", // robin + wordmark link
    "needs-category-bell",
    "screen-content", // the page column (<main>) · native <Screen> content
    "bottom-nav",
    "tab-home",
    "tab-budgets",
    "tab-activity",
    "tab-more",
    "tab-pip", // the active tab's red marker
    "deletion-banner",
    "review-banner-excluded",
    "review-banner-advisory",
    "limited-history-banner",
  ],
  pageHeader: ["page-header", "page-title", "page-subtitle", "page-back", "page-month", "page-action"],
  monthNav: ["month-nav", "month-prev", "month-label", "month-next"],
  sectionHead: ["section-head", "section-title", "section-link"],
  hub: ["hub-section", "hub-<route>", "hub-<route>-label", "hub-<route>-value"], // <route> = href without the leading "/", "/" → "-"
  atoms: [
    "progress-bar",
    "segmented",
    "segment-<value>",
    "badge",
    "icon-tile",
    "stage",
    "empty-state",
    "empty-state-title",
    "rolling-amount",
    "row-menu",
    "sheet",
    "sheet-title",
    "sheet-close",
  ],
  charts: ["spending-trend-card", "spending-breakdown-card"],
  feedback: ["loading-skeleton", "error-state", "error-retry", "not-found", "offline-state"],
  // Lane D-2 screens (native set; the web's data-testid of the same name is P2 work). Repeated ids are numbered.
  budgets: [
    "budgets-hero", // the Remaining card
    "budgets-remaining", // its figure
    "budgets-unplanned", // the "X has no budget" note and its button
    "budgets-copy", // "Copy last month"
    "budget-card", // one per category
    "budgets-all-time", // the All time list card
    "budgets-all-time-row", // one per category in it
  ],
  goals: [
    "goals-hero", // the Total saved card
    "goals-total", // its figure
    "goals-summary", // "N% of $X across N goals"
    "goal-card", // one per goal
    "goals-empty", // Crystal's "No goals yet" card
  ],
  insights: [
    "insights-money-left", // the Money left card
    "insights-savings-rate", // the savings rate card
    "insights-waffle", // its 10x10 waffle
    "insights-suggestion", // "Where you could save"
    "insights-breakdown", // the breakdown card (Spending / Income)
    "insights-total", // its total
    "insights-income-row", // one per income source
  ],
} as const;

/** Hub rows and tabs derive their ids in one place, shared with the web components and the native atoms. */
export { hubTestId, tabTestId } from "../../src/lib/brand/test-ids";

/* ─── Screens ───────────────────────────────────────────────────────────── */

/** A colour check: the pixel at (fx, fy) of the element's box (fractions, default centre) must be the token exactly. */
export type ColorCheck = { id: string; role: keyof typeof ROLE; at?: [number, number] };

export type Screen = {
  id: string;
  /** web path (signed in as the state's user) */
  web: string;
  /** native deep link path, `budgts://<native>` */
  native: string;
  states: StateId[];
  /** frozen-motion capture time, ms after load (default 4000) */
  freezeAt?: number;
  colors?: ColorCheck[];
};

/** Colours every signed-in tab screen shares. */
const SHELL_COLORS: ColorCheck[] = [
  { id: "app-header", role: "bg", at: [0.5, 0.5] },
  { id: "bottom-nav", role: "surface", at: [0.5, 0.92] },
  { id: "tab-pip", role: "accent" },
];

export const SCREENS: Screen[] = [
  { id: "onboarding", web: "/onboarding", native: "onboarding", states: ["firstrun"] },
  { id: "tour", web: "/tour", native: "tour", states: ["tour"] },
  { id: "home", web: "/", native: "", states: ["empty", "full", "over", "banks", "deleting", "loading", "error"], colors: SHELL_COLORS },
  { id: "budgets", web: "/budgets", native: "budgets", states: ["empty", "full", "over"], colors: SHELL_COLORS },
  { id: "activity", web: "/transactions", native: "activity", states: ["empty", "full", "banks"], colors: SHELL_COLORS },
  { id: "more", web: "/more", native: "more", states: ["empty", "full"], colors: SHELL_COLORS },
  { id: "goals", web: "/goals", native: "goals", states: ["empty", "full"] },
  { id: "insights", web: "/insights", native: "insights", states: ["empty", "full"] },
  { id: "accounts", web: "/accounts", native: "accounts", states: ["empty", "full", "banks"] },
  { id: "connected-banks", web: "/connected-banks", native: "connected-banks", states: ["empty", "banks"] },
  { id: "settings", web: "/settings", native: "settings", states: ["full"] },
  { id: "profile", web: "/settings/profile", native: "settings/profile", states: ["full"] },
  { id: "security", web: "/settings/security", native: "settings/security", states: ["full"] },
  { id: "appearance", web: "/settings/appearance", native: "settings/appearance", states: ["full"] },
  { id: "categories", web: "/settings/categories", native: "settings/categories", states: ["full"] },
  { id: "delete-account", web: "/settings/delete-account", native: "settings/delete-account", states: ["full", "deleting"] },
  { id: "help", web: "/help", native: "help", states: ["full"] },
  { id: "how-it-works", web: "/help/how-it-works", native: "help/how-it-works", states: ["full"] },
  { id: "about", web: "/about", native: "about", states: ["full"] },
  { id: "not-found", web: "/parity-harness/not-found", native: "no-such-screen", states: ["notfound"] },
  { id: "offline", web: "/offline", native: "", states: ["offline"] },
  { id: "account-deleted", web: "/account-deleted", native: "account-deleted", states: ["signedout"] },
];

/** The web path a state is captured at: the harness stands in for a held or failed load (dev-only route, P2). */
export function webPathFor(screen: Screen, state: StateId): string {
  if (state === "loading") return "/parity-harness/loading";
  if (state === "error") return "/parity-harness/error";
  return screen.web;
}

/** The native deep link for a state: `?hold=` / `?fail=` name the endpoint the screen loads (dev builds only, P4). */
export function nativeLinkFor(screen: Screen, state: StateId): string {
  const endpoint = screen.id === "activity" ? "activity" : screen.id;
  const q = state === "loading" ? `?hold=${endpoint}` : state === "error" ? `?fail=${endpoint}` : "";
  return `budgts://${screen.native}${q}`;
}

export function findScreen(id: string): Screen {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`parity: no screen "${id}" (known: ${SCREENS.map((x) => x.id).join(", ")})`);
  return s;
}

/** Capture file stem: `<screen>-<state>` plus the motion set (`rest` = reduce motion, `frozen` = time-frozen). */
export type MotionSet = "rest" | "frozen";
export function captureName(screen: string, state: StateId, set: MotionSet): string {
  return `${screen}-${state}-${set}`;
}

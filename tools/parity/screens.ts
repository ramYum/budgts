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
 * The contract: the only ids the compare step matches. An id listed here must be on both sides wherever the element is
 * on screen (on one side only = a failure); any other test id is ignored. `<name>` is a placeholder for one or more
 * characters (a route, a row's database id, a step id, an index). `screen-root` is not an element to compare: it is the
 * native crop rect (the web's is the viewport). Repeated components carry the same id on every instance; the capture
 * numbers them in document order (`progress-bar#3`), and so must the native tree (both are depth-first, top to bottom).
 */
export const TESTIDS = {
  shell: [
    "app-header", // phone header bar (layout.tsx) · native AppHeader
    "app-logo", // robin + wordmark link
    "needs-category-bell",
    "needs-category-count", // the bell's badge
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
    "row-menu", // a screen may name its menu (`category-menu-<id>`); the list is `<menu>-list`, items `<menu>-<label-slug>`
    "sheet", // a screen may name its sheet (`category-sheet`); title and close are `<sheet>-title`, `<sheet>-close`
    "sheet-title",
    "sheet-close",
  ],
  charts: ["spending-trend-card", "spending-breakdown-card"],
  feedback: ["loading-skeleton", "error-state", "error-retry", "not-found", "offline-state"],
  // Lane A: onboarding and the welcome guide (web tour-card.tsx, tour-wizard.tsx, scenes.tsx, *-wizard-content.tsx)
  tour: [
    "tour-step-<stepId>",
    "tour-card",
    "tour-back",
    "tour-progress",
    "tour-progress-cell",
    "tour-skip",
    "tour-scene",
    "scene-<stepId>", // crystal, welcome, auto-capture, currency, bank, auto-sort, money-left, plan, done
    "crystal-drop",
    "scene-currency-amount",
    "bank-lock",
    "tour-name",
    "tour-heading",
    "tour-heading-word",
    "tour-body",
    "tour-media",
    "tour-primary",
    "tour-by-hand",
    "tour-footnote",
    "tour-how-it-works",
    "tour-error",
    "onboarding-currency",
    "onboarding-error",
  ],
  // Lane B: Home (dashboard-view.tsx, budget-over-alert.tsx, income-tile.tsx, add-transaction.tsx, crystal-perch.tsx)
  home: [
    "home-view",
    "home-over-alert",
    "home-over-alert-review",
    "home-over-alert-dismiss",
    "home-money-left",
    "home-hero-line",
    "home-came-in",
    "home-went-out",
    "home-add-income",
    "home-where",
    "home-where-summary",
    "home-where-rows",
    "home-where-row",
    "home-where-set-budget",
    "home-where-empty",
    "home-category-chip",
    "home-where-no-budgets",
    "home-change",
    "home-savings",
    "home-recent",
    "home-recent-rows",
    "home-recent-row",
    "home-recent-empty",
    "home-add-transaction",
    "crystal-perch",
    "crystal",
    "crystal-say-<kind>", // hello, note, tap, cheer
  ],
  // Lane C: More, Settings, Profile, Security, Appearance, Categories, Help, How it works, About, Delete account, Account deleted
  settings: [
    "more-play-guide",
    "settings-export",
    "settings-export-button",
    "settings-sign-out",
    "profile-card",
    "profile-name",
    "profile-details",
    "profile-email",
    "profile-copy-email",
    "profile-copy-email-copied",
    "profile-currency",
    "profile-time-zone",
    "profile-methods",
    "profile-methods-count",
    "security-lead",
    "security-facts",
    "security-how-it-works",
    "appearance-light",
    "appearance-active",
    "categories-add",
    "categories-<group>", // expense, income, archived
    "category-row",
    "category-<id>",
    "category-menu-<id>",
    "category-sheet",
    "category-name",
    "category-kind",
    "category-form-error",
    "category-save",
    "category-cancel",
    "help-how-it-works",
    "help-replay-guide",
    "help-faq",
    "help-faq-<i>",
    "help-faq-<i>-answer",
    "how-it-works-lead",
    "how-it-works-steps",
    "how-it-works-step",
    "how-it-works-guide",
    "how-it-works-open-guide",
    "about-stage",
    "about-lead",
    "about-details",
    "about-legal",
    "delete-account-view",
    "delete-stage",
    "delete-in-progress",
    "delete-what-happens",
    "delete-kept",
    "delete-store-notice",
    "delete-continue",
    "delete-keep",
    "delete-link-sent",
    "delete-send-again",
    "delete-stale",
    "delete-reauth-error",
    "delete-send-link",
    "delete-google",
    "delete-confirm-word",
    "delete-submit",
    "delete-deleting",
    "delete-error",
    "delete-connected-banks",
    "delete-retry",
    "delete-back-to-settings",
    "delete-sign-in-again",
    "account-deleted",
    "account-deleted-store",
    "account-deleted-kept",
    "account-deleted-done",
  ],
  // Lane D-1: Activity (transactions/page.tsx, transaction-list.tsx, plaid/needs-category.tsx)
  activity: [
    "activity-add",
    "activity-search",
    "activity-list",
    "txn-day",
    "txn-day-label",
    "txn-day-total",
    "txn-row",
    "txn-title",
    "txn-meta",
    "txn-amount",
    "show-more-rows",
    "activity-empty",
    "activity-no-match",
    "connect-bank-card",
    "category-band",
    "category-band-clear",
    "needs-category",
    "needs-category-total",
    "needs-category-rescan",
    "needs-category-group",
    "needs-category-label",
    "needs-category-more",
    "needs-category-error",
  ],
  // Lane D-2: Budgets and Goals (budgets-view.tsx, copy-budgets.tsx, goals-view.tsx)
  budgets: ["budgets-hero", "budgets-remaining", "budgets-unplanned", "budgets-copy", "budget-card", "budgets-all-time", "budgets-all-time-row"],
  goals: ["goals-hero", "goals-total", "goals-summary", "goal-card", "goals-empty"],
  // Lane E: Connected banks and Accounts (plaid/connected-banks.tsx, bank-connections.tsx, connect-bank.tsx,
  // account-mapping.tsx, reconnect-button.tsx, account-manager.tsx). <id> = plaid_items.id; <rowId> = plaid_accounts.id.
  banks: [
    "connected-banks-empty",
    "connected-banks-off",
    "bank-<id>",
    "bank-<id>-name",
    "bank-<id>-status",
    "bank-<id>-synced",
    "bank-<id>-attention",
    "bank-<id>-reconnect",
    "bank-<id>-reconnect-error",
    "bank-<id>-choose",
    "bank-<id>-sync",
    "bank-<id>-sync-message",
    "bank-<id>-disconnect",
    "account-<rowId>",
    "import-<rowId>",
    "connect-<rowId>",
    "review-<rowId>",
    "excluded-<rowId>",
    "mark-reviewed-<rowId>",
    "exclude-<rowId>",
    "include-<rowId>",
    "disconnect-confirm",
    "disconnect-purge-box",
    "disconnect-purge",
    "disconnect-error",
    "disconnect-submit",
    "disconnect-cancel",
    "connect-bank",
    "connect-bank-error",
    "connect-bank-notice",
    "account-mapping",
    "account-mapping-row-<i>",
    "account-mapping-mode-<i>",
    "account-mapping-name-<i>",
    "account-mapping-type-<i>",
    "account-mapping-existing-<i>",
    "account-mapping-save",
    "account-mapping-error",
    "account-mapping-warning",
    "account-mapping-done",
  ],
  accounts: [
    "accounts-add",
    "accounts-group-<key>",
    "account-row-<id>",
    "account-row-<id>-name",
    "account-row-<id>-meta",
    "account-row-<id>-menu",
    "account-form",
    "account-form-name",
    "account-form-type",
    "account-form-submit",
    "account-form-cancel",
    "account-form-error",
  ],
} as const;

/** The native crop rect; never compared as an element. */
export const SCREEN_ROOT = "screen-root";

/**
 * Ids the lanes registered natively that have no web counterpart, so they stay outside the contract: the web keeps the
 * state in one element, or has no such state. Listed so nobody adds them to TESTIDS by mistake.
 */
export const NATIVE_ONLY: Readonly<Record<string, string>> = {
  "<screen>-view (more, settings, profile, security, appearance, help, how-it-works, about, categories, connected-banks, accounts, activity)":
    "the web page is a fragment (PageHeader + body) with no wrapper element; page-header and screen-content cover it",
  "needs-category-title": "the web h2 holds the title and the count in one element; the count is needs-category-total",
  "home-refresh-notice, home-refresh-notice-retry": "native only: a failed background refresh keeps the last figures",
  "first-run-failure-detail, first-run-sign-out": "native only: the web's first-run gate throws to the error boundary",
  "settings-export-error": "the web export is a plain download link with no error line",
  "accounts-error": "the web drops a refused archive silently",
  "categories-error": "the web's category archive shows no error line",
  "activity-notice, activity-rest-loading, activity-rest-error": "native paging and refresh states",
};

/** A contract entry as a matcher: each `<name>` placeholder stands for one or more characters. */
export function contractPattern(entry: string): RegExp {
  const parts = entry.split(/<[^>]+>/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".+")}$`);
}

const CONTRACT: readonly RegExp[] = Object.values(TESTIDS)
  .flat()
  .map((e) => contractPattern(e));

/** Whether a test id (the id, not its `#n` key) is in the contract. `screen-root` never is: it is the crop rect. */
export function inContract(id: string): boolean {
  if (id === SCREEN_ROOT) return false;
  return CONTRACT.some((re) => re.test(id));
}

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

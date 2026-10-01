import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Href } from "expo-router";
import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { MobileHome } from "../../lib/home/contract";
import { render } from "../../test/render";
import { HomeView } from "./home-view";

/**
 * Every place Home can send the user must be a screen that exists (review 🔴1: the add flows pushed a deleted
 * `/transaction` route and landed on not-found). The app's routes are its `app/` files, groups `(x)` and `_layout` /
 * `+` files aside; each link Home makes, by tapping everything tappable in its main states, must resolve to one.
 */
const APP = join(__dirname, "..", "..", "app");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const ROUTES = new Set(
  files(APP)
    .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
    .map((f) => relative(APP, f).split("\\").join("/").replace(/\.tsx$/, ""))
    .filter((r) => !r.split("/").some((seg) => seg.startsWith("_") || seg.startsWith("+")))
    .map((r) => "/" + r.split("/").filter((seg) => !/^\(.*\)$/.test(seg) && seg !== "index").join("/")),
);

const pathOf = (href: Href) => (typeof href === "string" ? href.split("?")[0]! : String((href as { pathname: string }).pathname));

const base: MobileHome = {
  version: 1,
  month: "2026-09",
  today: "2026-09-19",
  currency: "USD",
  moneyLeft: -5000,
  income: 100000,
  spent: 105000,
  budgeted: 200000,
  leftToSpend: -1000,
  savingsRate: -0.05,
  categories: [
    { id: "a", name: "Dining", color: "#000", budget: 10000, actual: 15000, remaining: -5000, pctUsed: 150, state: "over" },
    { id: "b", name: "Fun", color: "#000", budget: 0, actual: 2000, remaining: -2000, pctUsed: 100, state: "over" },
  ],
  recent: [],
  savings: { activeCount: 1, totalSaved: 100, totalTarget: 200 },
  bankConnected: false,
  suggestion: { kind: "unbudgeted", categoryId: "b", name: "Fun", amount: 2000, share: 2 },
  breakdown: [{ name: "Dining", amount: 105000, share: 100 }],
  trend: [{ month: "2026-09", spend: 105000 }],
  trendChange: { total: 105000, delta: null, previousMonth: null },
  expenseCategories: [{ id: "a", name: "Dining" }],
};

function tapEverything(home: MobileHome): Href[] {
  const go = vi.fn<(href: Href) => void>();
  const r = render(
    <HomeView home={home} name="Alex" hour={9} go={go} onMonth={() => {}} onAddIncome={() => {}} onAddTransaction={() => {}} noticeShown />,
  );
  for (const n of r.root.findAll((x) => typeof x.type === "string" && typeof x.props.onPress === "function")) act(() => n.props.onPress());
  return go.mock.calls.map((c) => c[0]);
}

describe("Home only links to screens that exist", () => {
  it("the route list is the app's own", () => {
    expect(ROUTES).toContain("/budgets");
    expect(ROUTES).toContain("/activity");
    expect(ROUTES).not.toContain("/transaction");
  });

  it("every link in a busy month, a new month and a month without budgets resolves to a route", () => {
    const hrefs = [
      ...tapEverything(base),
      ...tapEverything({ ...base, income: 0, spent: 0, budgeted: 0, savingsRate: null, moneyLeft: 0, categories: [], suggestion: null, breakdown: [] }),
      ...tapEverything({ ...base, categories: [], budgeted: 0 }),
    ];
    expect(hrefs.length).toBeGreaterThan(8);
    const missing = hrefs.map(pathOf).filter((p) => !ROUTES.has(p));
    expect(missing).toEqual([]);
  });

  it("the Home screen itself names no route outside the app (no pushes to deleted screens)", () => {
    const src = readFileSync(join(APP, "(app)", "(tabs)", "(home)", "index.tsx"), "utf8");
    const literals = [...src.matchAll(/pathname:\s*"([^"]+)"|router\.(?:push|navigate|replace)\("([^"]+)"/g)].map((m) => (m[1] ?? m[2])!);
    expect(literals.filter((p) => !ROUTES.has(p.split("?")[0]!))).toEqual([]);
  });
});

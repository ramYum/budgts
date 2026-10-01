import type { ReactNode } from "react";
import { View } from "react-native";
import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render, texts } from "../../test/render";
import type { StaleNoticeProps } from "../feedback/refresh-notice";

/**
 * The Budgets route (app/(app)/(tabs)/(budgets)/budgets.tsx) with its data layer faked at authFetch: the project-wide
 * pull contract (a failed pull keeps the figures and says they may be out of date, never the skeleton).
 */
const api = vi.hoisted(() => ({ responses: [] as (() => Promise<Response>)[] }));
vi.mock("../../lib/auth/api", () => ({ authFetch: () => api.responses.shift()!(), NotAuthenticatedError: class extends Error {} }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: null, signOut: async () => {} }) }));
vi.mock("../../lib/profile/profile-hooks", () => ({ useUserDates: () => ({ month: "2026-09", today: "2026-09-30" }) }));
vi.mock("../../lib/realtime/use-realtime-refresh", () => ({ useRealtimeRefresh: () => {} }));
// states.tsx reads the connection for its offline page; this test never goes there
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {} } }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ navigate: () => {}, push: () => {}, setParams: () => {} }),
  useLocalSearchParams: () => ({}),
}));
// the shell's scroll view, reduced to what the contract needs: its pull handler and spinner state
vi.mock("../shell/screen", async () => {
  const { StaleNotice } = await import("../feedback/refresh-notice");
  return {
    Screen: ({ children, onRefresh, refreshing, ...stale }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean } & StaleNoticeProps) => (
      <View testID="screen" {...({ onRefresh, refreshing } as object)}>
        <StaleNotice {...stale} />
        {children}
      </View>
    ),
  };
});

const { default: BudgetsScreen } = await import("../../app/(app)/(tabs)/(budgets)/budgets");

const budgets = {
  version: 1,
  range: "month",
  month: "2026-09",
  currency: "USD",
  budgeted: 40000,
  spent: 12000,
  budgetedSpent: 12000,
  spentOutsideBudgets: 0,
  leftToSpend: 28000,
  spentPct: 30,
  tone: "under",
  suggestion: null,
  categories: [{ id: "g", name: "Groceries", color: "#0f0", budget: 40000, actual: 12000, remaining: 28000, pctUsed: 30, state: "under", previousActual: 0 }],
  unbudgetedCategories: [],
};
const ok = () => Promise.resolve(new Response(JSON.stringify(budgets), { status: 200, headers: { "Content-Type": "application/json" } }));
const offline = () => Promise.reject(new TypeError("Network request failed"));

const hostsById = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id);

describe("Budgets pull to refresh (the project-wide pull contract)", () => {
  it("keeps the cards when a pull fails and says they may be out of date, with a way to try again", async () => {
    api.responses.push(ok);
    const r = render(<BudgetsScreen />);
    await act(async () => {});
    expect(hostsById(r, "budget-card")).toHaveLength(1);

    api.responses.push(offline);
    const screen = hostsById(r, "screen")[0]!;
    await act(async () => screen.props.onRefresh());

    expect(hostsById(r, "budget-card")).toHaveLength(1);
    expect(hostsById(r, "screen-skeleton")).toHaveLength(0);
    expect(hostsById(r, "screen")[0]!.props.refreshing).toBe(false);
    const words = texts(r).join(" ");
    expect(words).toContain("These numbers may be out of date.");
    expect(words).toContain("Couldn't reach Budgts. Check your connection and try again.");

    api.responses.push(ok);
    await act(async () => hostsById(r, "budgets-refresh-notice-retry")[0]!.props.onPress());
    expect(texts(r).join(" ")).not.toContain("These numbers may be out of date.");
    expect(hostsById(r, "budget-card")).toHaveLength(1);
  });
});

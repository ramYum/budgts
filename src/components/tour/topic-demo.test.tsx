// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicDemo } from "./topic-demo";
import { TOUR_TOPICS } from "@/lib/tour/topics";

// The real components import server actions and next/navigation. They only run
// on a user gesture — which the inert frame prevents — so stubbing the modules
// keeps this a component test while still rendering the REAL components.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/server/plaid/actions", () => ({
  categorizeBankTransaction: vi.fn(),
  clearAccountReview: vi.fn(),
  disconnectBank: vi.fn(),
  mapAccounts: vi.fn(),
  rescanUncategorized: vi.fn(),
  setAccountCalculationExclusionAction: vi.fn(),
  setAccountImportingAction: vi.fn(),
  syncConnection: vi.fn(),
}));
vi.mock("@/server/categories", () => ({ createCategory: vi.fn() }));
vi.mock("@/server/transactions", () => ({ createTransaction: vi.fn() }));
vi.mock("@/components/spending-overview", () => ({
  SpendingTrendCard: () => null,
  SpendingBreakdownCard: () => null,
}));

const NOW = new Date("2026-09-19T10:00:00Z");
const accounts = [{ id: "real-1", name: "My Checking" }];

function frame(container: HTMLElement) {
  return container.querySelector<HTMLElement>(".tour-demo");
}

describe("TopicDemo", () => {
  it.each([
    ["organize", "activity"],
    ["money-left", "money-left"],
    ["disconnect", "disconnect"],
  ] as const)("%s: shows the real component with its '%s' target, inside an inert frame", (topic, target) => {
    const { container } = render(<TopicDemo topic={topic} accounts={accounts} plaidEnabled now={NOW} />);

    const f = frame(container)!;
    expect(f.getAttribute("data-tour-highlight")).toBe(target);
    const el = f.querySelector(`[data-tour-target="${target}"]`);
    expect(el).not.toBeNull();
    expect(el!.closest("[inert]")).not.toBeNull();
  });

  it("money-left shows the real Money Left card computed from the demo month", () => {
    render(<TopicDemo topic="money-left" accounts={accounts} plaidEnabled now={NOW} />);

    expect(screen.getAllByText("Money Left").length).toBeGreaterThan(0);
    expect(screen.getByText(/doesn.t measure savings-account balances/)).toBeInTheDocument();
  });

  it("categorization shows the real needs-a-category prompt for demo merchants", () => {
    render(<TopicDemo topic="categorization" accounts={accounts} plaidEnabled now={NOW} />);

    expect(screen.getByText("Blue Bottle Coffee")).toBeInTheDocument();
  });

  it("excluded-account shows the flagged state, then the excluded state", () => {
    const { container } = render(<TopicDemo topic="excluded-account" accounts={accounts} plaidEnabled now={NOW} />);

    const frames = container.querySelectorAll(".tour-demo");
    expect(frames).toHaveLength(2);
    expect(frames[0]!.querySelector('[data-tour-target="exclude"]')).not.toBeNull();
    expect(screen.getByText(/Excluded from totals/)).toBeInTheDocument();
  });

  it("connect-bank is LIVE, not a demo: the real connect button is outside any inert frame", () => {
    const { container } = render(<TopicDemo topic="connect-bank" accounts={accounts} plaidEnabled now={NOW} />);

    expect(frame(container)).toBeNull();
    const connect = screen.getByRole("button", { name: /Connect a bank/ });
    expect(connect.closest("[inert]")).toBeNull();
  });

  it("connect-bank without Plaid offers the manual fallback instead of a dead end", () => {
    render(<TopicDemo topic="connect-bank" accounts={accounts} plaidEnabled={false} now={NOW} />);

    expect(screen.getByRole("link", { name: "Add an account" })).toHaveAttribute("href", "/accounts");
  });

  it("has a demo for every topic in the walkthrough", () => {
    for (const t of TOUR_TOPICS) {
      const { container, unmount } = render(<TopicDemo topic={t.id} accounts={accounts} plaidEnabled now={NOW} />);
      expect(container.firstChild).not.toBeNull();
      unmount();
    }
  });
});

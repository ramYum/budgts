import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalsView } from "./goals-view";
import type { GoalProgress, GoalsSummary } from "@/lib/budget/savings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/server/savings", () => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  setGoalArchived: vi.fn(),
  addContribution: vi.fn(),
  withdrawFromGoal: vi.fn(),
}));

const progress = (over: Partial<GoalProgress> = {}): GoalProgress => ({
  id: "g1",
  name: "Emergency Fund",
  target: 1_000_000,
  saved: 250_000,
  remaining: 750_000,
  pct: 25,
  complete: false,
  targetDate: null,
  ...over,
});

const summary: GoalsSummary = {
  totalTarget: 1_000_000,
  totalSaved: 250_000,
  activeCount: 1,
  completeCount: 0,
};

describe("GoalsView", () => {
  it("renders a goal with amounts, percent and remaining", () => {
    render(<GoalsView items={[progress()]} summary={summary} currency="USD" />);
    expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00 / $10,000.00")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("$7,500.00 to go")).toBeInTheDocument();
  });

  it("shows the summary line", () => {
    render(<GoalsView items={[progress()]} summary={summary} currency="USD" />);
    expect(
      screen.getByText("$2,500.00 of $10,000.00 saved across 1 goal"),
    ).toBeInTheDocument();
  });

  it("marks a completed goal as reached", () => {
    render(
      <GoalsView
        items={[progress({ saved: 1_000_000, remaining: 0, pct: 100, complete: true })]}
        summary={{ ...summary, totalSaved: 1_000_000, completeCount: 1 }}
        currency="USD"
      />,
    );
    expect(screen.getByText(/Reached/)).toBeInTheDocument();
    expect(screen.queryByText(/to go/)).not.toBeInTheDocument();
  });

  it("shows an empty state with no goals", () => {
    render(
      <GoalsView
        items={[]}
        summary={{ totalTarget: 0, totalSaved: 0, activeCount: 0, completeCount: 0 }}
        currency="USD"
      />,
    );
    expect(screen.getByText(/No goals yet/)).toBeInTheDocument();
  });
});

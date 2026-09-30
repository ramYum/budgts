import { describe, expect, it, vi } from "vitest";
import type { MobileGoal, MobileGoals } from "../../lib/goals/goals-api";
import { byTestId, render, textContent, texts } from "../../test/render";
import { PageHeader } from "../kit/page-header";
import { ProgressBar } from "../kit/progress-bar";
import { RowMenu } from "../kit/row-menu";
import { Reveal } from "../motion/reveal";
import { GoalsView } from "./goals-view";

const goal = (over: Partial<MobileGoal> = {}): MobileGoal => ({
  id: "fund",
  name: "Emergency fund",
  target: 500000,
  saved: 465000,
  remaining: 35000,
  pct: 93,
  complete: false,
  targetDate: "2027-04-01",
  ...over,
});

const data = (over: Partial<MobileGoals> = {}): MobileGoals => ({
  currency: "USD",
  today: "2026-09-30",
  summary: { totalTarget: 123956789, totalSaved: 465000, activeCount: 2, completeCount: 1 },
  goals: [goal(), goal({ id: "boat", name: "Boat", target: 123456789, saved: 0, remaining: 123456789, pct: 0, targetDate: null })],
  ...over,
});

function view(over: Partial<Parameters<typeof GoalsView>[0]> = {}) {
  const props: Parameters<typeof GoalsView>[0] = {
    data: data(),
    savedPct: 0,
    archiving: null,
    onBack: vi.fn(),
    onNew: vi.fn(),
    onAction: vi.fn(),
    ...over,
  };
  return { r: render(<GoalsView {...props} />), props };
}

describe("Savings goals (web goals-view.tsx)", () => {
  it("heads the page with a back arrow and Add", () => {
    const { r, props } = view();
    const header = r.root.findByType(PageHeader);
    expect(header.props.title).toBe("Savings goals");
    header.props.onBack();
    expect(props.onBack).toHaveBeenCalled();
    expect(byTestId(r, "goals-add").props.accessibilityLabel).toBe("Add goal");
    byTestId(r, "goals-add").props.onPress();
    expect(props.onNew).toHaveBeenCalled();
  });

  it("leads with Total saved, growth cells and the share line the web prints", () => {
    const { r } = view({ savedPct: 37 });
    expect(textContent(byTestId(r, "goals-total"))).toBe("$4,650.00");
    expect(byTestId(r, "goals-hero").findByType(ProgressBar).props).toMatchObject({ pct: 37, tone: "growth", cellHeight: 12 });
    expect(textContent(byTestId(r, "goals-summary"))).toBe("37% of $1,239,567.89 across 2 goals · 1 reached");
  });

  it("says goal for one and leaves out reached when none are", () => {
    const one = data({ summary: { totalTarget: 500000, totalSaved: 465000, activeCount: 1, completeCount: 0 }, goals: [goal()] });
    expect(textContent(byTestId(view({ data: one, savedPct: 93 }).r, "goals-summary"))).toBe("93% of $5,000.00 across 1 goal");
  });

  it("gives each goal a card: to go and by when, its share, saved of target, cells cascading three steps apart", () => {
    const { r } = view();
    expect(textContent(byTestId(r, "goal-fund-to-go"))).toBe("$350.00 to go · by Apr 2027");
    expect(textContent(byTestId(r, "goal-boat-to-go"))).toBe("$1,234,567.89 to go");
    expect(texts(byTestId(r, "goal-fund"))).toContain("93%");
    expect(textContent(byTestId(r, "goal-fund-saved"))).toBe("$4,650.00 of $5,000.00");
    const bars = byTestId(r, "goals-list").findAllByType(ProgressBar);
    expect(bars.map((b) => [b.props.pct, b.props.tone, b.props.cellHeight, b.props.start])).toEqual([
      [93, "growth", 10, 0],
      [0, "growth", 10, 3],
    ]);
    expect(r.root.findAllByType(Reveal).map((n) => n.props.i)).toEqual([1, 2, 3]);
  });

  it("reads Reached for a complete goal", () => {
    const { r } = view({ data: data({ goals: [goal({ complete: true, remaining: 0, pct: 100, targetDate: null })] }) });
    expect(textContent(byTestId(r, "goal-fund-to-go"))).toBe("Reached");
  });

  it("offers Add money, Withdraw, and Edit / Archive in the row menu", () => {
    const { r, props } = view({ archiving: "boat" });
    byTestId(r, "goal-fund-add").props.onPress();
    byTestId(r, "goal-fund-withdraw").props.onPress();
    const menus = r.root.findAllByType(RowMenu);
    expect(menus[0].props.label).toBe("More for Emergency fund");
    menus[0].props.items[0].onSelect();
    menus[0].props.items[1].onSelect();
    expect((props.onAction as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(["add", "withdraw", "edit", "archive"]);
    expect(menus[0].props.items.map((i: { label: string; disabled?: boolean }) => [i.label, !!i.disabled])).toEqual([
      ["Edit", false],
      ["Archive", false],
    ]);
    expect(menus[1].props.items[1].disabled).toBe(true);
  });

  it("shows Crystal's empty card with the way to start", () => {
    const { r } = view({ data: data({ goals: [], summary: { totalTarget: 0, totalSaved: 0, activeCount: 0, completeCount: 0 } }) });
    expect(textContent(byTestId(r, "goals-empty"))).toBe(
      "No goals yetA trip, a cushion, a big buy: add one with Add goal and watch it fill, cell by cell.",
    );
    expect(r.root.findAll((n) => n.props.testID === "goals-hero")).toHaveLength(0);
  });
});

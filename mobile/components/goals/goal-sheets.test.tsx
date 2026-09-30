import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent, texts } from "../../test/render";
import { Overlay } from "../kit/overlay";
import { ContributionSheet, GoalFormSheet, goalInitial } from "./goal-sheets";

const has = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => n.props.testID === id).length > 0;

describe("New goal / Edit goal (web goal-form.tsx)", () => {
  it("asks for the web's fields and sends a blank target date as none", async () => {
    const onSubmit = vi.fn(async () => null);
    const onClose = vi.fn();
    const r = render(<GoalFormSheet title="New goal" submitLabel="Create goal" onSubmit={onSubmit} onClose={onClose} />);
    expect(r.root.findByType(Overlay).props.title).toBe("New goal");
    expect(texts(r)).toEqual(expect.arrayContaining(["Name", "Target amount", "Target date (optional)", "Create goal", "Cancel"]));
    expect(byTestId(r, "goal-name").props.placeholder).toBe("Emergency fund");
    expect(byTestId(r, "goal-target").props.placeholder).toBe("10000.00");
    act(() => byTestId(r, "goal-name").props.onChangeText("Trip"));
    act(() => byTestId(r, "goal-target").props.onChangeText("2500"));
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({ name: "Trip", targetAmount: "2500", targetDate: null });
    expect(onClose).toHaveBeenCalled();
  });

  it("prefills an edit the way the web does and keeps the form open with the server's message", async () => {
    const onSubmit = vi.fn(async () => "Target must be more than 0");
    const onClose = vi.fn();
    const initial = goalInitial({ id: "g", name: "Fund", target: 500000, saved: 0, remaining: 500000, pct: 0, complete: false, targetDate: "2027-04-01" });
    expect(initial).toEqual({ name: "Fund", targetAmount: "5000.00", targetDate: "2027-04-01" });
    const r = render(<GoalFormSheet title="Edit goal" submitLabel="Save changes" initial={initial} onSubmit={onSubmit} onClose={onClose} />);
    expect(byTestId(r, "goal-date").props.value).toBe("2027-04-01");
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledWith(initial);
    expect(textContent(byTestId(r, "goal-form-error"))).toBe("Target must be more than 0");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Cancel", () => {
    const onClose = vi.fn();
    const r = render(<GoalFormSheet title="New goal" submitLabel="Create goal" onSubmit={vi.fn()} onClose={onClose} />);
    byTestId(r, "goal-form-cancel").props.onPress();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Add to / Withdraw from (web contribution-form.tsx)", () => {
  it("dates it the user's today, takes a positive amount and an optional note", async () => {
    const onSubmit = vi.fn(async () => null);
    const r = render(<ContributionSheet title="Add to Fund" submitLabel="Add contribution" today="2026-09-30" onSubmit={onSubmit} onClose={vi.fn()} />);
    expect(byTestId(r, "goal-contribution-date").props.value).toBe("2026-09-30");
    expect(has(r, "goal-contribution-hint")).toBe(false);
    act(() => byTestId(r, "goal-amount").props.onChangeText("25"));
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({ amount: "25", occurredAt: "2026-09-30", note: null });
  });

  it("explains a withdrawal", async () => {
    const onSubmit = vi.fn(async () => null);
    const hint = "Use this to take money out or fix a mistake. It's recorded as a negative entry.";
    const r = render(<ContributionSheet title="Withdraw from Fund" submitLabel="Withdraw" hint={hint} today="2026-09-30" onSubmit={onSubmit} onClose={vi.fn()} />);
    expect(textContent(byTestId(r, "goal-contribution-hint"))).toBe(hint);
    act(() => byTestId(r, "goal-amount").props.onChangeText("10"));
    act(() => byTestId(r, "goal-note").props.onChangeText("fix"));
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({ amount: "10", occurredAt: "2026-09-30", note: "fix" });
  });
});

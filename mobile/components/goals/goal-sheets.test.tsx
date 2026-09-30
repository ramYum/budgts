import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent, texts } from "../../test/render";
import { DateField } from "../kit/date-field";
import { Overlay } from "../kit/overlay";
import { ContributionSheet, GoalFormSheet, goalInitial } from "./goal-sheets";

// The native picker ships Flow source the test bundler can't read; the field's own behaviour is tested in kit.
vi.mock("@react-native-community/datetimepicker", () => ({ default: () => null, DateTimePickerAndroid: { open: () => {} } }));

// A fresh id per call, so a sheet that reused a new one per submit would show two.
const uuids = vi.hoisted(() => ({ n: 0 }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++uuids.n}` }));

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
    expect(onSubmit).toHaveBeenCalledWith({ name: "Trip", targetAmount: "2500", targetDate: null }, expect.stringMatching(/^uuid-/));
    expect(onClose).toHaveBeenCalled();
  });

  it("prefills an edit the way the web does and keeps the form open with the server's message", async () => {
    const onSubmit = vi.fn(async () => "Target must be more than 0");
    const onClose = vi.fn();
    const initial = goalInitial({ id: "g", name: "Fund", target: 500000, saved: 0, remaining: 500000, pct: 0, complete: false, targetDate: "2027-04-01" });
    expect(initial).toEqual({ name: "Fund", targetAmount: "5000.00", targetDate: "2027-04-01" });
    const r = render(<GoalFormSheet title="Edit goal" submitLabel="Save changes" initial={initial} onSubmit={onSubmit} onClose={onClose} />);
    expect(r.root.findAll((n) => n.type === DateField)[0]!.props.value).toBe("2027-04-01");
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledWith(initial, null);
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
    const date = r.root.findAll((n) => n.type === DateField)[0]!;
    expect(date.props).toMatchObject({ label: "Date", value: "2026-09-30" });
    expect(has(r, "goal-contribution-hint")).toBe(false);
    act(() => byTestId(r, "goal-amount").props.onChangeText("25"));
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({ amount: "25", occurredAt: "2026-09-30", note: null }, expect.stringMatching(/^uuid-/));
  });

  it("explains a withdrawal", async () => {
    const onSubmit = vi.fn(async () => null);
    const hint = "Use this to take money out or fix a mistake. It's recorded as a negative entry.";
    const r = render(<ContributionSheet title="Withdraw from Fund" submitLabel="Withdraw" hint={hint} today="2026-09-30" onSubmit={onSubmit} onClose={vi.fn()} />);
    expect(textContent(byTestId(r, "goal-contribution-hint"))).toBe(hint);
    act(() => byTestId(r, "goal-amount").props.onChangeText("10"));
    act(() => byTestId(r, "goal-note").props.onChangeText("fix"));
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({ amount: "10", occurredAt: "2026-09-30", note: "fix" }, expect.stringMatching(/^uuid-/));
  });
});

describe("a retried save lands once (one request id per sheet)", () => {
  it("New goal sends the same request id on every submit from one sheet", async () => {
    const onSubmit = vi.fn(async () => "Couldn't reach Budgts. Check your connection and try again.");
    const r = render(<GoalFormSheet title="New goal" submitLabel="Create goal" onSubmit={onSubmit} onClose={vi.fn()} />);
    act(() => byTestId(r, "goal-name").props.onChangeText("Trip"));
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect(onSubmit).toHaveBeenCalledTimes(2);
    const ids = onSubmit.mock.calls.map((c) => (c as unknown[])[1]);
    expect(ids[0]).toMatch(/^uuid-/);
    expect(ids[1]).toBe(ids[0]);
  });

  it("Edit goal sends no request id (a PATCH is idempotent)", async () => {
    const onSubmit = vi.fn(async () => null);
    const initial = { name: "Fund", targetAmount: "5000.00", targetDate: null };
    const r = render(<GoalFormSheet title="Edit goal" submitLabel="Save changes" initial={initial} onSubmit={onSubmit} onClose={vi.fn()} />);
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    expect((onSubmit.mock.calls[0] as unknown[])[1]).toBeNull();
  });

  it("a contribution sends the same request id on every submit, and a new sheet a new one", async () => {
    const onSubmit = vi.fn(async () => "Something went wrong. Please try again.");
    const sheet = () => <ContributionSheet title="Add to Fund" submitLabel="Add contribution" today="2026-09-30" onSubmit={onSubmit} onClose={vi.fn()} />;
    const r = render(sheet());
    act(() => byTestId(r, "goal-amount").props.onChangeText("25"));
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    await act(async () => byTestId(r, "goal-form-submit").props.onPress());
    const again = render(sheet());
    await act(async () => byTestId(again, "goal-form-submit").props.onPress());
    const ids = onSubmit.mock.calls.map((c) => (c as unknown[])[1]);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });
});

describe("the request id the server accepts", () => {
  // The goals commands accept only a UUID request id (src/lib/goals/commands.ts `badRequestId`, the same RFC 4122 shape).
  const SERVER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it("goal and contribution creates send a UUID from expo-crypto, never an m- id", async () => {
    const real = await vi.importActual<typeof import("node:crypto")>("node:crypto");
    const Crypto = await import("expo-crypto");
    const spy = vi.spyOn(Crypto, "randomUUID").mockImplementation(() => real.randomUUID() as ReturnType<typeof Crypto.randomUUID>);
    const onGoal = vi.fn(async () => null);
    const onContribution = vi.fn(async () => null);
    const g = render(<GoalFormSheet title="New goal" submitLabel="Create goal" onSubmit={onGoal} onClose={vi.fn()} />);
    await act(async () => byTestId(g, "goal-form-submit").props.onPress());
    const c = render(<ContributionSheet title="Add to Fund" submitLabel="Add contribution" today="2026-09-30" onSubmit={onContribution} onClose={vi.fn()} />);
    await act(async () => byTestId(c, "goal-form-submit").props.onPress());
    for (const id of [(onGoal.mock.calls[0] as unknown[])[1], (onContribution.mock.calls[0] as unknown[])[1]]) {
      expect(id).toMatch(SERVER_UUID);
    }
    spy.mockRestore();
  });
});

import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { budgetsLink } from "./params";
import { useBudgetsRoute } from "./use-budgets-route";

const ID = "3f2c1a9e-8b7d-4c6e-9f10-112233445566";
type Route = ReturnType<typeof useBudgetsRoute>;

/** A stand-in router: setParams merges into the params, as expo-router's does, and re-renders the screen with them. */
function harness(initial: Record<string, string | undefined>) {
  let params = { ...initial };
  let route!: Route;
  const setParams = vi.fn((p: Record<string, string | undefined>) => {
    params = { ...params, ...p };
    act(() => r.update(<Probe params={params} />));
  });
  function Probe({ params: p }: { params: Record<string, string | undefined> }) {
    route = useBudgetsRoute(p, "2026-09", setParams);
    return null;
  }
  const r = render(<Probe params={params} />);
  return {
    route: () => route,
    setParams,
    /** a link that merges into the mounted screen's params (router.navigate may keep what it doesn't set) */
    linkMerge(p: Record<string, string | undefined>) {
      params = { ...params, ...p };
      act(() => r.update(<Probe params={params} />));
    },
    /** a link into the tab (router.navigate replaces the params) */
    link(p: Record<string, string | undefined>) {
      params = { ...p };
      act(() => r.update(<Probe params={params} />));
    },
  };
}

describe("useBudgetsRoute (the Budgets params follow the screen)", () => {
  it("opens a linked category's sheet for editing, and the same link again after closing reopens it", () => {
    const h = harness({ m: "2026-08", edit: ID });
    expect(h.route()).toMatchObject({ month: "2026-08", range: "month", detail: { id: ID, editing: true } });
    act(() => h.route().closeDetail());
    expect(h.setParams).toHaveBeenLastCalledWith({ edit: undefined });
    expect(h.route().detail).toBeNull();
    h.link({ m: "2026-08", edit: ID });
    expect(h.route().detail).toEqual({ id: ID, editing: true });
  });

  it("writes the month and range back, so a link to the month on screen before a change still applies", () => {
    const h = harness({});
    expect(h.route().month).toBe("2026-09");
    act(() => h.route().showMonth("2026-07"));
    expect(h.setParams).toHaveBeenLastCalledWith({ m: "2026-07", range: "month" });
    act(() => h.route().showRange("all"));
    expect(h.setParams).toHaveBeenLastCalledWith({ m: "2026-07", range: "all" });
    expect(h.route()).toMatchObject({ month: "2026-07", range: "all" });
    h.link({ m: "2026-09", edit: ID });
    expect(h.route()).toMatchObject({ month: "2026-09", range: "month", detail: { id: ID, editing: true } });
  });

  it("steps the month back to This month, and a tapped card opens without touching the params", () => {
    const h = harness({ range: "all" });
    act(() => h.route().showMonth("2026-08"));
    expect(h.route()).toMatchObject({ month: "2026-08", range: "month" });
    const calls = h.setParams.mock.calls.length;
    act(() => h.route().openDetail("c1", false));
    expect(h.route().detail).toEqual({ id: "c1", editing: false });
    expect(h.setParams.mock.calls.length).toBe(calls);
  });

  it("never writes the params on first mount", () => {
    const h = harness({ m: "2026-08", edit: ID });
    expect(h.setParams).not.toHaveBeenCalled();
    expect(h.route().detail).toEqual({ id: ID, editing: true });
  });

  it("drops a stale edit on a month or range step, so a link to an absent category never pops a sheet later", () => {
    const h = harness({});
    // the linked category has no bar this month: the screen shows no sheet, but the param stays until the next step
    h.link({ m: "2026-08", edit: ID });
    act(() => h.route().showMonth("2026-07"));
    expect(h.setParams).toHaveBeenLastCalledWith({ m: "2026-07", range: "month", edit: undefined });
    expect(h.route().detail).toBeNull();
    act(() => h.route().showRange("all"));
    expect(h.setParams).toHaveBeenLastCalledWith({ m: "2026-07", range: "all", edit: undefined });
    act(() => h.route().showRange("month"));
    expect(h.route().detail).toBeNull();
  });

  it("opens an edit link's sheet after All time, even when the link merges into the old params", () => {
    const h = harness({});
    act(() => h.route().showRange("all"));
    const link = budgetsLink.edit("2026-09", ID) as { params: Record<string, string> };
    h.linkMerge(link.params);
    expect(h.route()).toMatchObject({ month: "2026-09", range: "month", detail: { id: ID, editing: true } });
  });
});

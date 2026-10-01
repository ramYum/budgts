import type { ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { byTestId, flat, hosts, render, textContent } from "../../test/render";
import { HEADER_BLUR, Screen } from "./screen";

vi.mock("expo-router", () => ({ useRouter: () => ({ push: () => {}, navigate: () => {} }) }));
vi.mock("../../lib/status/status-context", () => ({ useStatus: () => ({ needsCategoryCount: 2, review: { advisory: null, excluded: null }, deletionInProgress: false }) }));

describe("Screen's sticky header (web bg-bg/90 backdrop-blur-xl)", () => {
  it("draws the header over a backdrop blur of the content, which scrolls under it", () => {
    const r = render(
      <Screen>
        <></>
      </Screen>,
    );
    const scroll = hosts(r, "ScrollView")[0]!;
    // the header clearance is inside the view blocks measure against (Y2): a measured y is the scroll content's y
    expect(flat(scroll.props.contentContainerStyle).paddingTop).toBeUndefined();
    const measuredAgainst = scroll.children[0] as ReactTestInstance;
    expect(flat(measuredAgainst.props.style).paddingTop).toBe(56);
    expect(measuredAgainst.props.collapsable).toBe(false);
    const blur = r.root.findAll((n) => n.props.blurTarget !== undefined)[0]!;
    expect(blur.props).toMatchObject(HEADER_BLUR);
    expect(HEADER_BLUR.intensity / 4).toBeGreaterThanOrEqual(24); // Android: radius = intensity ÷ reduction 4, the web's 24px
    expect(r.root.findAll((n) => n.props.testID === "app-header" && typeof n.type === "string")).toHaveLength(1);
  });

  it("puts the header first in reading order, drawn over the content by zIndex", () => {
    const r = render(
      <Screen>
        <></>
      </Screen>,
    );
    const root = r.root.findAll((n) => (n.type as unknown) === "View")[0]!;
    const [first, second] = root.children as ReactTestInstance[];
    expect(first!.findAll((n) => n.props.testID === "app-header" && typeof n.type === "string")).toHaveLength(1);
    expect(flat(first!.props.style)).toMatchObject({ position: "absolute", zIndex: 1 });
    expect(second!.findAll((n) => (n.type as unknown) === "ScrollView")).toHaveLength(1);
  });
});

describe("Screen's stale-data notice (the pull contract's `notice`, one place for every screen)", () => {
  it("draws the notice at the top of the page, under the banners, with the screen's ids and a Refresh", () => {
    const onRetry = vi.fn();
    const r = render(
      <Screen name="budgets" notice="Couldn't reach Budgts." onRetry={onRetry}>
        <Text testID="page">page</Text>
      </Screen>,
    );
    const notice = byTestId(r, "budgets-refresh-notice");
    expect(textContent(notice)).toBe("These numbers may be out of date. Couldn't reach Budgts. Refresh.");
    byTestId(r, "budgets-refresh-notice-retry").props.onPress();
    expect(onRetry).toHaveBeenCalledOnce();
    // in the page column, before the page itself
    const content = byTestId(r, "screen-content");
    const order = content.findAll((n) => typeof n.type === "string" && ["budgets-refresh-notice", "page"].includes(n.props.testID));
    expect(order.map((n) => n.props.testID)).toEqual(["budgets-refresh-notice", "page"]);
  });

  it("draws nothing when the last reload landed", () => {
    const r = render(
      <Screen name="budgets" notice={null} onRetry={() => {}}>
        <></>
      </Screen>,
    );
    expect(r.root.findAll((n) => n.props.testID === "budgets-refresh-notice")).toHaveLength(0);
  });
});

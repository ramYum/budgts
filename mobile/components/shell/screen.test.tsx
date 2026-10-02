import type { ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { byTestId, flat, hosts, render, textContent } from "../../test/render";
import { BACKDROP_MUTED } from "../../lib/brand/backdrop";
import { ROLE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text as BrandText } from "../brand/text";
import { HEADER_BLUR, Screen } from "./screen";

vi.mock("expo-router", () => ({ useRouter: () => ({ push: () => {}, navigate: () => {} }) }));
vi.mock("../../lib/status/status-context", () => ({ useStatus: () => ({ needsCategoryCount: 2, review: { advisory: null, excluded: null }, deletionInProgress: false }) }));
const session = vi.hoisted(() => ({ access_token: "t" }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session }) }));
const pullWithBankRefresh = vi.hoisted(() => vi.fn());
vi.mock("../../lib/plaid/bank-refresh", () => ({ pullWithBankRefresh: (...a: unknown[]) => pullWithBankRefresh(...a) }));

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

describe("Screen over the sunset backdrop (option B)", () => {
  it("paints no canvas of its own, so the shell's backdrop shows behind the page", () => {
    const r = render(
      <Screen>
        <></>
      </Screen>,
    );
    const root = r.root.findAll((n) => (n.type as unknown) === "View")[0]!;
    expect(flat(root.props.style).backgroundColor).toBeUndefined();
    expect(flat(hosts(r, "ScrollView")[0]!.props.style).backgroundColor).toBeUndefined();
  });

  it("draws muted text and icons straight on the sky in BACKDROP_MUTED, and the gray again on a surface (the web's .on-backdrop)", () => {
    const r = render(
      <>
        <Screen>
          <BrandText testID="on-sky" variant="body" color={ROLE.muted}>
            of your budget
          </BrandText>
          <Icon testID="on-sky-icon" name="chevron-right" color={ROLE.muted} />
          <BrandText testID="on-sky-ink" variant="body" color={ROLE.ink}>
            Where it went
          </BrandText>
          <PixelFrame frame="px-card">
            <BrandText testID="in-card" variant="body" color={ROLE.muted}>
              Money left
            </BrandText>
            <Icon testID="in-card-icon" name="chevron-right" color={ROLE.muted} />
          </PixelFrame>
        </Screen>
        <BrandText testID="off-shell" variant="body" color={ROLE.muted}>
          Sign in
        </BrandText>
      </>,
    );
    const colorOf = (id: string) => flat(byTestId(r, id).props.style).color;
    const fillOf = (id: string) => hosts(byTestId(r, id), "Path").map((p) => p.props.fill);
    expect(colorOf("on-sky")).toBe(BACKDROP_MUTED);
    expect(new Set(fillOf("on-sky-icon"))).toEqual(new Set([BACKDROP_MUTED]));
    expect(colorOf("on-sky-ink")).toBe(ROLE.ink);
    expect(colorOf("in-card")).toBe(ROLE.muted);
    expect(new Set(fillOf("in-card-icon"))).toEqual(new Set([ROLE.muted]));
    expect(colorOf("off-shell")).toBe(ROLE.muted);
  });
});

describe("Screen's pull to refresh", () => {
  it("a pull re-reads the screen and asks for the bank refresh with the session, through one call", () => {
    pullWithBankRefresh.mockImplementation((_s: unknown, refetch: () => void) => refetch());
    const onRefresh = vi.fn();
    const r = render(
      <Screen onRefresh={onRefresh}>
        <></>
      </Screen>,
    );
    hosts(r, "ScrollView")[0]!.props.refreshControl.props.onRefresh();
    expect(pullWithBankRefresh).toHaveBeenCalledExactlyOnceWith(session, onRefresh);
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("a screen without onRefresh has no pull, so no bank refresh", () => {
    const r = render(
      <Screen>
        <></>
      </Screen>,
    );
    expect(hosts(r, "ScrollView")[0]!.props.refreshControl).toBeUndefined();
  });
});

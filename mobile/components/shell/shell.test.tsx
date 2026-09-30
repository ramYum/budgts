import { describe, expect, it, vi } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, textContent, texts } from "../../test/render";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Logo, wordmarkSize } from "../brand/logo";
import { AppHeader } from "./app-header";
import { BottomTabs, contentBottomPad, TAB_BAR_HEIGHT, TABS } from "./bottom-tabs";
import { StatusBanners } from "./status-banners";

const insets = { top: 24, bottom: 0, left: 0, right: 0 };
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => insets }));

describe("BottomTabs (web bottom-nav.tsx)", () => {
  it("is the web's four tabs in the web's order", () => {
    expect(TABS.map((t) => [t.label, t.icon])).toEqual([
      ["Home", "home"],
      ["Budgets", "budgets"],
      ["Activity", "activity"],
      ["More", "more"],
    ]);
  });

  it("paints the current tab as the one red element: red icon, ink semibold label, the pip", () => {
    const r = render(<BottomTabs active="(more)" onSelect={() => {}} />);
    const more = byTestId(r, "tab-more");
    expect(more.props.accessibilityState).toEqual({ selected: true });
    const icons = hosts(r, "Svg").map((s) => hosts(s, "Path")[0]!.props.fill);
    expect(icons).toEqual([ROLE.muted, ROLE.muted, ROLE.muted, COLOR.signal]);
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "tab-pip")).toHaveLength(1);
    const labels = hosts(r, "Text").map((t) => flat(t.props.style));
    expect(labels.map((s) => s.color)).toEqual([ROLE.muted, ROLE.muted, ROLE.muted, ROLE.text]);
    expect(labels.every((s) => s.fontSize === 13 && s.lineHeight === 16)).toBe(true);
  });

  it("has the web bar's geometry: a 2px hairline, 12 over the icon, 8 under the label, at least 4 below", () => {
    const r = render(<BottomTabs active="(home)" onSelect={() => {}} />);
    expect(flat(byTestId(r, "bottom-nav").props.style)).toMatchObject({
      borderTopWidth: 2,
      borderTopColor: ROLE.hairline,
      backgroundColor: ROLE.surface,
      paddingBottom: 4,
    });
    expect(flat(byTestId(r, "tab-home").props.style({ pressed: false }))).toMatchObject({ flex: 1, gap: 4, paddingTop: 12, paddingBottom: 8 });
    expect(TAB_BAR_HEIGHT).toBe(66);
    // the web's column ends 112px above the screen's edge
    expect(contentBottomPad(0)).toBe(112 - 66 - 4);
    expect(contentBottomPad(34)).toBe(112 - 66 - 34);
  });

  it("the pip snaps in on steps(3), and holds still with reduced motion", () => {
    const r = render(<BottomTabs active="(home)" onSelect={() => {}} />);
    const pip = flat(byTestId(r, "tab-pip").props.style);
    expect(pip).toMatchObject({ top: -2, width: 16, height: 4, backgroundColor: COLOR.signal, animationDuration: "220ms" });
    expect(pip.animationTimingFunction).toEqual({ steps: 3, modifier: "jump-end" });
    reducedMotion.value = true;
    try {
      const still = flat(render(<BottomTabs active="(home)" onSelect={() => {}} />).root.findAll((n) => typeof n.type === "string" && n.props.testID === "tab-pip")[0]!.props.style);
      expect(still.animationName).toBeUndefined();
    } finally {
      reducedMotion.value = false;
    }
  });

  it("selects a tab by its route group", () => {
    const pick = vi.fn();
    const r = render(<BottomTabs active="(home)" onSelect={pick} />);
    byTestId(r, "tab-activity").props.onPress();
    expect(pick).toHaveBeenCalledWith("(activity)");
  });
});

describe("AppHeader (web dashboard layout header)", () => {
  it("is 56px under the status bar, the lockup left, the bell right", () => {
    const r = render(<AppHeader needsCategoryCount={3} onHome={() => {}} onBell={() => {}} />);
    expect(flat(byTestId(r, "app-header").props.style)).toMatchObject({ paddingTop: 24, backgroundColor: ROLE.bg });
    expect(byTestId(r, "needs-category-bell").props.accessibilityLabel).toBe("3 transactions need a category");
    expect(texts(byTestId(r, "needs-category-count"))).toEqual(["3"]);
  });

  it("has no bell when bank connections are off, and no count at zero", () => {
    expect(render(<AppHeader needsCategoryCount={null} onHome={() => {}} onBell={() => {}} />).root.findAll((n) => n.props.testID === "needs-category-bell")).toHaveLength(0);
    const zero = render(<AppHeader needsCategoryCount={0} onHome={() => {}} onBell={() => {}} />);
    expect(zero.root.findAll((n) => n.props.testID === "needs-category-count")).toHaveLength(0);
  });

  it("the lockup is the robin 22px tall and the Dogica wordmark at 16px (web Logo)", () => {
    expect(wordmarkSize(22)).toBe(16);
    const r = render(<Logo size={22} />);
    expect(r.root.findByType(Robin).props.scale).toBe(1);
    expect(texts(r)).toEqual(["Budgts"]);
  });
});

describe("StatusBanners (web DeletionBanner + ReviewBanner)", () => {
  const quiet = { needsCategoryCount: 0, review: { advisory: null, excluded: null }, deletionInProgress: false };

  it("shows nothing when nothing is wrong, or before the status arrives", () => {
    expect(render(<StatusBanners status={quiet} onFinishDeleting={() => {}} onReview={() => {}} />).toJSON()).toBeNull();
    expect(render(<StatusBanners status={null} onFinishDeleting={() => {}} onReview={() => {}} />).toJSON()).toBeNull();
  });

  it("says a deleting account is read-only, with the way to finish", () => {
    const finish = vi.fn();
    const r = render(<StatusBanners status={{ ...quiet, deletionInProgress: true }} onFinishDeleting={finish} onReview={() => {}} />);
    expect(textContent(byTestId(r, "deletion-banner"))).toBe("Your account is being deleted. It's read-only, so changes won't save. Finish deleting.");
    hosts(r, "Text").find((t) => t.props.accessibilityRole === "link")!.props.onPress();
    expect(finish).toHaveBeenCalled();
    expect(r.root.findAll((n) => n.type === PixelFrame)[0]!.props.frame).toBe("px-wash");
  });

  it("qualifies totals: excluded on the wash, advisory on the amber warn frame", () => {
    const r = render(
      <StatusBanners status={{ ...quiet, review: { excluded: "Advancial is excluded.", advisory: "A feed looks duplicated." } }} onFinishDeleting={() => {}} onReview={() => {}} />,
    );
    expect(r.root.findAll((n) => n.type === PixelFrame).map((f) => f.props.frame)).toEqual(["px-wash", "px-warn"]);
    expect(textContent(byTestId(r, "review-banner-advisory"))).toBe("Totals may be inaccurate. A feed looks duplicated. Review it in Settings.");
  });
});

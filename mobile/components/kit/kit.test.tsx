import { describe, expect, it, vi } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { RATIO } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, texts } from "../../test/render";
import { Button } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { DOT, dotsPath, EmptyState } from "./empty-state";
import { HubRow, HubSection } from "./hub-list";
import { MonthNav } from "./month-nav";
import { PageHeader } from "./page-header";
import { SectionHead } from "./section-head";
import { SegmentedControl } from "./segmented-control";
import { Badge } from "./tiles";

describe("HubRow / HubSection (web hub-list.tsx)", () => {
  it("is the web row: 32px tile, 16px gap, 8px vertical padding, 15/24 medium label, 13/20 muted value", () => {
    const r = render(<HubRow href="/goals" label="Savings goals" icon="goals" value="2 goals" go={() => {}} />);
    const row = byTestId(r, "hub-goals");
    expect(row.props.accessibilityLabel).toBe("Savings goals, 2 goals");
    expect(flat(row.props.style({ pressed: false }))).toMatchObject({ flexDirection: "row", columnGap: 16, paddingVertical: 8 });
    const label = byTestId(r, "hub-goals-label");
    expect(flat(label.props.style)).toMatchObject({ ...textStyle("listName"), color: ROLE.ink });
    expect(flat(byTestId(r, "hub-goals-value").props.style)).toMatchObject({ fontSize: 13, lineHeight: 20, color: ROLE.muted });
    expect(r.root.findAll((n) => n.type === PixelFrame && n.props.frame === "px-tile")).toHaveLength(1);
  });

  it("presses feel like the web's .press (0.98)", () => {
    const r = render(<HubRow href="/help" label="Help" icon="help" go={() => {}} />);
    expect(flat(byTestId(r, "hub-help").props.style({ pressed: true })).transform).toEqual([{ scale: 0.98 }]);
  });

  it("a section is its heading, then one px-card whose rows are divided by 1px rules", () => {
    const r = render(
      <HubSection title="Your money">
        <HubRow href="/goals" label="Savings goals" icon="goals" go={() => {}} />
        <HubRow href="/accounts" label="Accounts" icon="accounts" go={() => {}} />
      </HubSection>,
    );
    expect(texts(r)).toContain("Your money");
    const card = r.root.findAll((n) => n.type === PixelFrame && n.props.frame === "px-card");
    expect(card).toHaveLength(1);
    expect(flat(card[0]!.props.style)).toMatchObject({ paddingHorizontal: 8, paddingVertical: 2 });
    const dividers = hosts(r, "View").filter((v) => flat(v.props.style).borderTopWidth === 1);
    expect(dividers).toHaveLength(1);
    expect(flat(dividers[0]!.props.style).borderTopColor).toBe(COLOR.divider);
  });
});

describe("PageHeader (web page-header.tsx)", () => {
  it("sets the title in the pixel title role, with a back arrow only when there is somewhere to go back to", () => {
    const back = vi.fn();
    const r = render(<PageHeader title="Settings" onBack={back} />);
    expect(flat(byTestId(r, "page-title").props.style)).toMatchObject(textStyle("pxTitle"));
    byTestId(r, "page-back").props.onPress();
    expect(back).toHaveBeenCalled();
    expect(render(<PageHeader title="More" />).root.findAll((n) => n.props.testID === "page-back")).toHaveLength(0);
    expect(flat(byTestId(r, "page-header").props.style)).toMatchObject({ marginBottom: 20 });
  });
});

describe("SectionHead", () => {
  it("heads a section in t-head ink and links on the right", () => {
    const go = vi.fn();
    const r = render(<SectionHead title="Recent activity" action="See all" onAction={go} />);
    expect(texts(r)).toEqual(["Recent activity", "See all"]);
    byTestId(r, "section-link").props.onPress();
    expect(go).toHaveBeenCalled();
  });
});

describe("SegmentedControl", () => {
  it("marks the selected chip as the web's aria-pressed frame, white semibold", () => {
    const pick = vi.fn();
    const r = render(
      <SegmentedControl
        value="month"
        onChange={pick}
        options={[
          { value: "month", label: "This month" },
          { value: "all", label: "All time" },
        ]}
      />,
    );
    const frames = r.root.findAll((n) => n.type === PixelFrame);
    expect(frames.map((f) => f.props.state)).toEqual(["[aria-pressed='true']", ""]);
    expect(byTestId(r, "segment-month").props.accessibilityState).toEqual({ selected: true });
    byTestId(r, "segment-all").props.onPress();
    expect(pick).toHaveBeenCalledWith("all");
  });
});

describe("MonthNav", () => {
  it("labels the server's month and steps the key", () => {
    const go = vi.fn();
    const r = render(<MonthNav month="2026-01" onChange={go} />);
    expect(texts(r)).toContain("January 2026");
    byTestId(r, "month-prev").props.onPress();
    byTestId(r, "month-next").props.onPress();
    expect(go.mock.calls).toEqual([["2025-12"], ["2026-02"]]);
  });
});

describe("Badge, EmptyState, Stage dots", () => {
  it("a badge is 24px tall in 12px semibold on its tone's frame", () => {
    const r = render(<Badge tone="growth">Connected</Badge>);
    const frame = byTestId(r, "badge");
    expect(flat(frame.props.style)).toMatchObject({ height: 24, paddingHorizontal: 6 });
    expect(r.root.findByType(PixelFrame).props.frame).toBe("px-badge-growth");
  });

  it("an empty state says what is missing and offers one action", () => {
    const r = render(
      <EmptyState icon="goals" title="No goals yet" body="Set one up." action={<Button onPress={() => {}}>Add goal</Button>} />,
    );
    expect(texts(r)).toEqual(["No goals yet", "Set one up.", "Add goal"]);
    expect(flat(byTestId(r, "empty-state").props.style)).toMatchObject({ padding: 16, gap: 8 });
  });

  it("draws the web's 2px dot grid on whole device pixels", () => {
    const d = dotsPath(40, 40, RATIO);
    expect(d.match(/M/g)).toHaveLength(4); // dots at 7 and 23 on each axis
    expect(d.startsWith("M")).toBe(true);
    expect(DOT.color).toBe("#dcdcdc");
  });
});

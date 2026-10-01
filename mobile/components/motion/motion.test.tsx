import type { ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, texts } from "../../test/render";
import { ProgressBar, TONE_FILL } from "../kit/progress-bar";
import { reelOffset, reelWindow, RollingAmount } from "./rolling-amount";
import { cellLayout, sweepEdge } from "../../lib/ui/cells";
import { Reveal, scrolledIntoView, startsBelowFold, usePlay } from "./reveal";
import { ScrollWatchProvider, type ScrollWatch } from "./scroll-context";

function layoutTo(r: ReturnType<typeof render>, testID: string, width: number) {
  act(() => byTestId(r, testID).props.onLayout({ nativeEvent: { layout: { width, height: 8, x: 0, y: 0 } } }));
}

describe("ProgressBar (web .px-bar)", () => {
  it("draws the fitted cells once measured: the track, then the lit cells in the tone's fill", () => {
    const r = render(<ProgressBar pct={50} tone="under" />);
    expect(hosts(r, "Path")).toHaveLength(0); // nothing until the bar knows its width
    layoutTo(r, "progress-bar", 342);
    const [track, lit] = hosts(r, "Path");
    expect(track!.props.fill).toBe(ROLE.track);
    expect(lit!.props.fill).toBe(TONE_FILL.under);
    expect((track!.props.d as string).match(/M/g)).toHaveLength(34);
    expect((lit!.props.d as string).match(/M/g)).toHaveLength(17);
  });

  it("sweeps its cells in whole steps over 352ms, `start` steps after the page's first, by transform only", () => {
    const r = render(<ProgressBar pct={50} start={2} />);
    layoutTo(r, "progress-bar", 342);
    const [, windowView, inner] = hosts(r, "Animated.View").map((v) => flat(v.props.style));
    const l = cellLayout(342, { share: 0.5, minLit: 1 });
    const W = l.sweepWidth;
    for (const sweep of [windowView!, inner!]) {
      expect(sweep).toMatchObject({ animationDuration: "352ms", animationDelay: `${2 * 22 + 300}ms`, animationFillMode: "backwards" });
      expect(sweep.animationTimingFunction).toEqual({ steps: 34, modifier: "jump-start" });
      // no layout property animates: only translateX
      const frames = sweep.animationName as { from: Record<string, unknown>; to: Record<string, unknown> };
      expect(Object.keys(frames.from)).toEqual(["transform"]);
      expect(Object.keys(frames.to)).toEqual(["transform"]);
    }
    expect(windowView).toMatchObject({ width: W, overflow: "hidden" });
    const x = (v: Record<string, unknown>, at: "from" | "to") =>
      ((v.animationName as Record<string, { transform: { translateX: number }[] }>)[at]!.transform[0]!.translateX);
    expect([x(windowView!, "from"), x(windowView!, "to")]).toEqual([-W, 0]);
    expect([x(inner!, "from"), x(inner!, "to")]).toEqual([W, 0]);
    // at every step k the window's right edge is sweepEdge(k) (whole cells only) and the cells themselves never move
    for (let k = 0; k <= l.n; k++) {
      const outerX = -W + (k * W) / l.n;
      const innerX = W - (k * W) / l.n;
      expect(outerX + W).toBeCloseTo(sweepEdge(l, k));
      expect(outerX + innerX).toBeCloseTo(0);
    }
  });

  it("an over row is full and red, and flashes twice once full; nothing moves with reduced motion", () => {
    const r = render(<ProgressBar pct={130} tone="over" />);
    layoutTo(r, "progress-bar", 100);
    const [track, lit] = hosts(r, "Path");
    expect((lit!.props.d as string).match(/M/g)!.length).toBe((track!.props.d as string).match(/M/g)!.length);
    expect(lit!.props.fill).toBe(COLOR.signal);
    expect(flat(byTestId(r, "progress-bar").props.style).animationDuration).toBe("720ms");
    reducedMotion.value = true;
    try {
      const still = render(<ProgressBar pct={130} tone="over" />);
      layoutTo(still, "progress-bar", 100);
      expect(flat(byTestId(still, "progress-bar").props.style).animationName).toBeUndefined();
      expect(hosts(still, "Animated.View").slice(1).every((v) => flat(v.props.style).animationName === undefined)).toBe(true);
    } finally {
      reducedMotion.value = false;
    }
  });

  it("a zero share lights nothing; `cells` fixes the count and sizes the bar", () => {
    const r = render(<ProgressBar pct={0} cells={5} />);
    expect(hosts(r, "Path")).toHaveLength(1);
    expect(flat(byTestId(r, "progress-bar").props.style).width).toBe(5 * 8 + 4 * 2);
  });
});

describe("Reveal (web reveal.tsx)", () => {
  it("decides from the viewport like the web's IntersectionObserver", () => {
    expect(startsBelowFold(900, { height: 800, y: 0 })).toBe(true);
    expect(startsBelowFold(700, { height: 800, y: 0 })).toBe(false);
    expect(scrolledIntoView(900, { height: 800, y: 100 })).toBe(false); // 900 < 100 + 720? no
    expect(scrolledIntoView(900, { height: 800, y: 200 })).toBe(true);
  });

  it("rises in with the cascade: 70ms per section after 40ms", () => {
    const r = render(
      <Reveal i={3} testID="rv">
        <></>
      </Reveal>,
    );
    expect(flat(byTestId(r, "rv").props.style)).toMatchObject({ animationDuration: "560ms", animationDelay: `${3 * 70 + 40}ms` });
  });

  it("lets its children play unless it waits below the fold; motion off, it simply shows", () => {
    let plays: boolean | null = null;
    function Probe() {
      plays = usePlay();
      return null;
    }
    render(
      <Reveal i={0}>
        <Probe />
      </Reveal>,
    );
    expect(plays).toBe(true);
    reducedMotion.value = true;
    try {
      const r = render(
        <Reveal i={0} testID="rv">
          <Probe />
        </Reveal>,
      );
      expect(flat(byTestId(r, "rv").props.style).animationName).toBeUndefined();
    } finally {
      reducedMotion.value = false;
    }
  });

  it("outside a scrolling screen (no scroll watch, e.g. sign-in) it rises in on mount with the stagger and lets children play", () => {
    let plays: boolean | null = null;
    function Probe() {
      plays = usePlay();
      return null;
    }
    const r = render(
      <Reveal i={2} testID="rv">
        <Probe />
      </Reveal>,
    );
    expect(flat(byTestId(r, "rv").props.style)).toMatchObject({ animationName: expect.anything(), animationDelay: `${2 * 70 + 40}ms` });
    expect(flat(byTestId(r, "rv").props.style).opacity).toBeUndefined();
    expect(plays).toBe(true);
  });

  it("listens to the scroll only while it has something to decide: none once at rest, none once shown", () => {
    function harness(blockTop: number) {
      const listeners = new Set<() => void>();
      const vp = { height: 800, y: 0 };
      const watch: ScrollWatch = {
        contentRef: { current: {} as never },
        viewport: () => vp,
        subscribe: (l) => {
          listeners.add(l);
          return () => void listeners.delete(l);
        },
      };
      let r!: ReactTestRenderer;
      const node: ReactElement = (
        <ScrollWatchProvider watch={watch}>
          <Reveal i={0} testID="rv">
            <></>
          </Reveal>
        </ScrollWatchProvider>
      );
      act(() => {
        r = create(node, { createNodeMock: () => ({ measureLayout: (_to: unknown, cb: (x: number, y: number) => void) => cb(0, blockTop) }) });
      });
      const measured = r.root.findAll((n) => (n.type as unknown) === "View" && typeof n.props.onLayout === "function")[0]!;
      act(() => measured.props.onLayout());
      const scrollTo = (y: number) =>
        act(() => {
          vp.y = y;
          for (const l of [...listeners]) l();
        });
      return { r, listeners, scrollTo };
    }
    const onScreen = harness(100);
    expect(onScreen.listeners.size).toBe(0);
    expect(flat(byTestId(onScreen.r, "rv").props.style).opacity).toBeUndefined();

    const below = harness(1000);
    expect(below.listeners.size).toBe(1);
    expect(flat(byTestId(below.r, "rv").props.style)).toMatchObject({ opacity: 0 });
    below.scrollTo(200); // 1000 < 200 + 720? no
    expect(below.listeners.size).toBe(1);
    below.scrollTo(400);
    expect(below.listeners.size).toBe(0);
    expect(flat(byTestId(below.r, "rv").props.style).animationDuration).toBeDefined();
  });
});

describe("RollingAmount (web rolling-amount.tsx)", () => {
  it("reads as the plain amount and rests on the final figure", () => {
    const r = render(<RollingAmount value={123456} currency="USD" />);
    expect(byTestId(r, "rolling-amount").props.accessibilityLabel).toBe("$1,234.56");
    // every visible glyph column: $ , . and six ghost digits
    expect(texts(r).filter((t) => t.length === 1).join("")).toBe("$1,234.56");
  });

  it("rests each reel on its digit, a lap on for the ones and cents", () => {
    const { lineHeight } = textStyle("tNumXl");
    expect(reelOffset(4, false, lineHeight)).toBe(-4 * lineHeight);
    expect(reelOffset(4, true, lineHeight)).toBe(-14 * lineHeight);
  });

  it("clips Geist reels to the digits' ink band and Dogica reels to the line box", () => {
    const geist = reelWindow("tNumXl");
    const { fontSize, lineHeight } = textStyle("tNumXl");
    expect(geist.height).toBeCloseTo(0.88 * fontSize);
    expect(geist.top).toBeCloseTo((lineHeight - 0.88 * fontSize) / 2);
    expect(reelWindow("pxFigureLg")).toEqual({ top: 0, height: textStyle("pxFigureLg").lineHeight });
  });

  it("spins in left to right, 45ms a column after 120ms; plain text with reduced motion", () => {
    const r = render(<RollingAmount value={1200} currency="USD" />);
    const delays = hosts(r, "Animated.View").map((v) => flat(v.props.style).animationDelay);
    expect(delays).toEqual(["165ms", "210ms", "255ms", "300ms"]);
    reducedMotion.value = true;
    try {
      expect(texts(render(<RollingAmount value={1200} currency="USD" />))).toEqual(["$12.00"]);
    } finally {
      reducedMotion.value = false;
    }
  });
});

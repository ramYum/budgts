import { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, texts } from "../../test/render";
import { ProgressBar, TONE_FILL } from "../kit/progress-bar";
import { reelOffset, reelWindow, RollingAmount } from "./rolling-amount";
import { Reveal, scrolledIntoView, startsBelowFold, usePlay } from "./reveal";

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

  it("sweeps its cells in whole steps over 352ms, `start` steps after the page's first", () => {
    const r = render(<ProgressBar pct={50} start={2} />);
    layoutTo(r, "progress-bar", 342);
    const sweep = flat(hosts(r, "Animated.View")[1]!.props.style);
    expect(sweep).toMatchObject({ animationDuration: "352ms", animationDelay: `${2 * 22 + 300}ms`, animationFillMode: "backwards" });
    expect(sweep.animationTimingFunction).toEqual({ steps: 34, modifier: "jump-start" });
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
      expect(flat(hosts(still, "Animated.View")[1]!.props.style).animationName).toBeUndefined();
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

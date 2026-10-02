import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { BACKDROP_LAND_GAP, BACKDROP_SKY, drawBackdrop, sceneRects } from "../../../src/lib/brand/scene-art";
import { backdropPaths, backdropSize } from "../../lib/brand/backdrop";
import { RATIO, windowSize } from "../../test/native-hosts";
import { byTestId, flat, hosts, render } from "../../test/render";
import { Backdrop, BackdropProvider } from "./backdrop";

// The scene's <Svg>, counted: a render of it is a redraw of the whole scene.
const svgRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("react-native-svg", async () => {
  const { svgMock } = await import("../../test/native-hosts");
  const real = svgMock();
  const Counted = (props: Record<string, unknown>) => {
    svgRenders.count++;
    return real.Svg(props);
  };
  return { ...real, default: Counted, Svg: Counted };
});

// The status bar's height (safe-area top); 0 unless a test sets it.
const insets = vi.hoisted(() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => insets }));

const BAR = 70; // the bar's laid-out height, safe area included

describe("Backdrop (option B, the web's components/backdrop.tsx)", () => {
  it("covers the window, its meadow BACKDROP_LAND_GAP above the bar's top, ending at the window's bottom, over the top band", () => {
    const r = render(
      <BackdropProvider barHeight={BAR}>
        <Backdrop />
      </BackdropProvider>,
    );
    const size = backdropSize(windowSize.width, windowSize.height, BAR);
    expect(size.rows - size.land).toBe(Math.round((BAR + BACKDROP_LAND_GAP) / 2));
    const box = byTestId(r, "backdrop");
    expect(flat(box.props.style)).toMatchObject({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", backgroundColor: BACKDROP_SKY[0] });
    expect(box.props.pointerEvents).toBe("none");
    expect(box.props.importantForAccessibility).toBe("no-hide-descendants");
    const svg = hosts(r, "Svg")[0]!;
    expect(svg.props).toMatchObject({ width: size.cols * 2, height: size.rows * 2 });
    // its bottom edge on the window's bottom edge, placed from the top so a copy in a shorter box lands on the same pixels
    expect(flat(svg.props.style)).toMatchObject({ position: "absolute", left: 0, top: windowSize.height - size.rows * 2 });
    expect(flat(svg.props.style).top).toBeLessThanOrEqual(0);
    expect(svg.props.width).toBeGreaterThanOrEqual(windowSize.width);
    expect(svg.props.height).toBeGreaterThanOrEqual(windowSize.height);
  });

  it("draws the shared scene, one path per colour, every edge on a whole device pixel", () => {
    const r = render(
      <BackdropProvider barHeight={BAR}>
        <Backdrop />
      </BackdropProvider>,
    );
    const size = backdropSize(windowSize.width, windowSize.height, BAR);
    const paths = hosts(r, "Path");
    const colours = [...sceneRects(drawBackdrop(size.cols, size.rows, size.land)).keys()];
    expect(paths.map((p) => p.props.fill)).toEqual(colours);
    for (const p of paths) {
      for (const n of (p.props.d as string).match(/-?\d*\.?\d+/g)!) expect(Math.abs(Number(n) * RATIO - Math.round(Number(n) * RATIO))).toBeLessThan(1e-6);
    }
  });

  it("is drawn once per size: a re-render with the same window and bar reuses the paths and skips the scene", () => {
    const size = backdropSize(windowSize.width, windowSize.height, BAR);
    expect(backdropPaths(size, RATIO)).toBe(backdropPaths({ ...size }, RATIO));
    const tree = () => (
      <BackdropProvider barHeight={BAR}>
        <Backdrop />
      </BackdropProvider>
    );
    svgRenders.count = 0;
    const r = render(tree());
    expect(svgRenders.count).toBe(1);
    // the shell re-rendering (a tab switch, the bar re-reporting the same height) leaves the scene alone
    act(() => r.update(tree()));
    expect(svgRenders.count).toBe(1);
    expect(hosts(r, "Path").map((p) => p.props.d)).toEqual(backdropPaths(size, RATIO).map(([, d]) => d));
  });

  it("follows the window (rotation, split screen) and the bar (text size)", () => {
    const r = render(
      <BackdropProvider barHeight={BAR}>
        <Backdrop />
      </BackdropProvider>,
    );
    const saved = { ...windowSize };
    try {
      windowSize.width = 915;
      windowSize.height = 412;
      act(() =>
        r.update(
          <BackdropProvider barHeight={BAR + 10}>
            <Backdrop />
          </BackdropProvider>,
        ),
      );
      const size = backdropSize(915, 412, BAR + 10);
      expect(hosts(r, "Svg")[0]!.props).toMatchObject({ width: size.cols * 2, height: size.rows * 2 });
      expect(hosts(r, "Path").map((p) => p.props.d)).toEqual(backdropPaths(size, RATIO).map(([, d]) => d));
    } finally {
      Object.assign(windowSize, saved);
    }
  });

  it("is sized for the window below the status bar (the web's viewport): band 0 runs from the status bar through the header", () => {
    insets.top = 24;
    try {
      const r = render(
        <BackdropProvider barHeight={BAR}>
          <Backdrop />
        </BackdropProvider>,
      );
      const size = backdropSize(windowSize.width, windowSize.height - 24, BAR);
      const svg = hosts(r, "Svg")[0]!;
      expect(svg.props).toMatchObject({ width: size.cols * 2, height: size.rows * 2 });
      // still ending on the window's bottom edge, so the meadow keeps its place above the bar
      expect(flat(svg.props.style).top).toBe(windowSize.height - size.rows * 2);
      expect(flat(svg.props.style).top).toBeGreaterThanOrEqual(23); // the status bar shows the box's band-0 colour
      expect(flat(byTestId(r, "backdrop").props.style).backgroundColor).toBe(BACKDROP_SKY[0]);
      expect(hosts(r, "Path").map((p) => p.props.d)).toEqual(backdropPaths(size, RATIO).map(([, d]) => d));
    } finally {
      insets.top = 0;
    }
  });

  it("is only ever drawn inside the shell that sizes it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Backdrop />)).toThrow("<Backdrop> is drawn inside <BackdropProvider>");
    vi.mocked(console.error).mockRestore();
  });
});

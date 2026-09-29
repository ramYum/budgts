import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EGG_FRAMES, EGG_LOOP, EGG_STEP_MS } from "../lib/brand/shared";
import { frameCallbacks, tickFrames } from "../test/native-hosts";
import { LoadingScreenProvider, useLoadingScreen } from "./loading-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(node);
  });
  return r;
}
const overlay = (r: ReactTestRenderer) => r.root.findAll((n) => n.props.testID === "loading-screen" && typeof n.type === "string");
const label = (r: ReactTestRenderer) =>
  r.root.find((n) => n.props.accessibilityRole === "progressbar" && typeof n.type === "string").props.accessibilityLabel as string;

let setScreenLoading!: (v: boolean) => void;
function Screen({ initial, label: words = "Loading your account" }: { initial: boolean; label?: string }) {
  const [loading, set] = useState(initial);
  setScreenLoading = set;
  useLoadingScreen(loading, words);
  return null;
}
/** the egg frame showing (the stand-in styles are read on render) */
const eggFrame = (r: ReactTestRenderer) =>
  EGG_FRAMES.findIndex((f) => {
    const n = r.root.find((x) => x.props.testID === `egg-frame-${f.angle}` && typeof x.type === "string");
    const style = Object.assign({}, ...[n.props.style].flat(2));
    return style.opacity === 1;
  });

afterEach(() => {
  frameCallbacks.length = 0;
});

describe("the loading screen", () => {
  it("covers start-up from the first frame, and hands the splash its cue once laid out", () => {
    const onLayout = vi.fn();
    const r = render(
      <LoadingScreenProvider loading onLayout={onLayout}>
        {null}
      </LoadingScreenProvider>,
    );
    expect(overlay(r)).toHaveLength(1);
    expect(overlay(r)[0]!.props.pointerEvents).toBe("auto");
    expect(label(r)).toBe("Loading");
    const loader = r.root.find((n) => n.props.accessibilityRole === "progressbar" && typeof n.type === "string");
    loader.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height: 915 } } });
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it("stays up, one loader, while a screen that mounts loading takes over from start-up", () => {
    const r = render(
      <LoadingScreenProvider loading>
        <Screen initial />
      </LoadingScreenProvider>,
    );
    const first = overlay(r)[0];
    act(() =>
      r.update(
        <LoadingScreenProvider loading={false}>
          <Screen initial />
        </LoadingScreenProvider>,
      ),
    );
    expect(overlay(r)).toHaveLength(1);
    expect(overlay(r)[0]).toBe(first); // the same egg, still rolling
    expect(label(r)).toBe("Loading your account");
  });

  it("gets out of the way the moment nothing is loading: no minimum time, then gone", () => {
    const r = render(
      <LoadingScreenProvider loading={false}>
        <Screen initial />
      </LoadingScreenProvider>,
    );
    expect(overlay(r)).toHaveLength(1);
    act(() => setScreenLoading(false));
    expect(overlay(r)).toHaveLength(0); // (the stand-in fade finishes at once)
  });

  it("comes back for a later load, such as a retry", () => {
    const r = render(
      <LoadingScreenProvider loading={false}>
        <Screen initial={false} />
      </LoadingScreenProvider>,
    );
    expect(overlay(r)).toHaveLength(0);
    act(() => setScreenLoading(true));
    expect(overlay(r)).toHaveLength(1);
  });

  it("needs its provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Screen initial />)).toThrow(/LoadingScreenProvider/);
  });

  it("keeps the egg rolling through re-renders: a new hold label never restarts its clock", () => {
    const r = render(
      <LoadingScreenProvider loading>
        <Screen initial label="Signing you in" />
      </LoadingScreenProvider>,
    );
    const step = 5;
    act(() => {
      tickFrames(2000);
      tickFrames(2000 + step * EGG_STEP_MS + 1);
    });
    // start-up finishes and the screen's own load takes over under a new label
    act(() =>
      r.update(
        <LoadingScreenProvider loading={false}>
          <Screen initial label="Loading your account" />
        </LoadingScreenProvider>,
      ),
    );
    expect(label(r)).toBe("Loading your account");
    expect(eggFrame(r)).toBe(EGG_LOOP[step]!.frame);
    // and the display keeps counting from where it was, not from zero
    act(() => tickFrames(2000 + (step + 1) * EGG_STEP_MS + 1));
    act(() =>
      r.update(
        <LoadingScreenProvider loading={false} label="Loading">
          <Screen initial label="Loading your account" />
        </LoadingScreenProvider>,
      ),
    );
    expect(eggFrame(r)).toBe(EGG_LOOP[step + 1]!.frame);
    for (const c of frameCallbacks) expect(c.seen.size, "the frame callback was re-registered").toBe(1);
  });

  it("is the only thing a screen reader sees while loading, then gives the screen back", () => {
    const r = render(
      <LoadingScreenProvider loading={false}>
        <Screen initial />
      </LoadingScreenProvider>,
    );
    const content = () => r.root.find((n) => n.props.importantForAccessibility !== undefined && n.props.style?.flex === 1 && typeof n.type === "string");
    expect(overlay(r)[0]!.props.accessibilityViewIsModal).toBe(true);
    expect(content().props).toMatchObject({ importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true });
    act(() => setScreenLoading(false));
    expect(content().props).toMatchObject({ importantForAccessibility: "auto", accessibilityElementsHidden: false });
  });
});

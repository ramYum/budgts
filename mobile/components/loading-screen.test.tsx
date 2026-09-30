import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { EGG_FRAMES } from "../lib/brand/shared";
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
/** Every egg frame layer's animation, by testID (the same objects, or new ones). */
const eggAnimations = (r: ReactTestRenderer) =>
  EGG_FRAMES.map((f) => {
    const n = r.root.find((x) => x.props.testID === `egg-frame-${f.angle}` && typeof x.type === "string");
    return Object.assign({}, ...[n.props.style].flat(2)).animationName as unknown;
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

  it("keeps the egg rolling through re-renders: a new hold label hands the same animations on, so nothing restarts", () => {
    const r = render(
      <LoadingScreenProvider loading>
        <Screen initial label="Signing you in" />
      </LoadingScreenProvider>,
    );
    const before = eggAnimations(r);
    expect(before.every((a) => a !== undefined)).toBe(true);
    // start-up finishes and the screen's own load takes over under a new label
    act(() =>
      r.update(
        <LoadingScreenProvider loading={false}>
          <Screen initial label="Loading your account" />
        </LoadingScreenProvider>,
      ),
    );
    expect(label(r)).toBe("Loading your account");
    const after = eggAnimations(r);
    after.forEach((a, i) => expect(a, EGG_FRAMES[i]!.angle.toString()).toBe(before[i]));
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

import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
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
function Screen({ initial }: { initial: boolean }) {
  const [loading, set] = useState(initial);
  setScreenLoading = set;
  useLoadingScreen(loading, "Loading your account");
  return null;
}

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
});

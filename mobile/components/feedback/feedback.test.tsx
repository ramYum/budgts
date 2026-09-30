import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ROLE } from "../../lib/brand/shared";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, textContent } from "../../test/render";
import { Robin } from "../brand/robin";
import { ScreenSkeleton, Skeleton, SKELETON_HIGHLIGHT } from "./skeleton";
import { ErrorState, LoadFailure, OfflineState } from "./states";

type NetListener = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;
const net = vi.hoisted(() => ({ listeners: [] as NetListener[] }));
vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: (l: NetListener) => {
      net.listeners.push(l);
      return () => void net.listeners.splice(net.listeners.indexOf(l), 1);
    },
  },
}));
const emit = (isConnected: boolean) => act(() => net.listeners.forEach((l) => l({ isConnected, isInternetReachable: isConnected })));

describe("Skeleton (web .skeleton)", () => {
  it("is the sunken surface with a #e8e8e8 band sweeping across every 1.4s, forever", () => {
    const r = render(<Skeleton width={100} height={16} />);
    expect(flat(hosts(r, "View")[0]!.props.style)).toMatchObject({ width: 100, height: 16, backgroundColor: ROLE.surface2, overflow: "hidden" });
    act(() => hosts(r, "View")[0]!.props.onLayout({ nativeEvent: { layout: { width: 100, height: 16 } } }));
    const band = flat(hosts(r, "Animated.View")[0]!.props.style);
    expect(band).toMatchObject({ width: 60, animationDuration: "1400ms", animationIterationCount: "infinite", animationTimingFunction: "linear" });
    expect(band.animationName).toEqual({ from: { transform: [{ translateX: -80 }] }, to: { transform: [{ translateX: 120 }] } });
    expect(hosts(r, "Stop").map((s) => s.props.stopColor)).toEqual([ROLE.surface2, SKELETON_HIGHLIGHT, ROLE.surface2]);
  });

  it("holds still with motion off", () => {
    reducedMotion.value = true;
    try {
      const r = render(<Skeleton width={100} height={16} />);
      act(() => hosts(r, "View")[0]!.props.onLayout({ nativeEvent: { layout: { width: 100, height: 16 } } }));
      expect(hosts(r, "Animated.View")).toHaveLength(0);
    } finally {
      reducedMotion.value = false;
    }
  });

  it("the screen skeleton is the web's loading.tsx on a phone: title, lead card, four rows, busy to a screen reader", () => {
    const r = render(<ScreenSkeleton />);
    expect(byTestId(r, "loading-skeleton").props).toMatchObject({ accessibilityLabel: "Loading…", accessibilityState: { busy: true } });
    const sizes = r.root.findAll((n) => n.type === Skeleton).map((s) => [s.props.width, s.props.height]);
    expect(sizes.slice(0, 5)).toEqual([
      [192, 24],
      [160, 16],
      [96, 16],
      [224, 40],
      ["100%", 12],
    ]);
    expect(sizes).toHaveLength(5 + 4 * 3);
  });
});

describe("ErrorState / OfflineState (web error.tsx, offline/page.tsx)", () => {
  it("says what went wrong and offers Try again and Home", () => {
    const retry = vi.fn();
    const home = vi.fn();
    const r = render(<ErrorState onRetry={retry} onHome={home} />);
    const all = textContent(byTestId(r, "error-state"));
    for (const t of ["Something went wrong", "Your data is safe.", "Try again", "Home"]) expect(all).toContain(t);
    expect(r.root.findByType(Robin).props.mood).toBe("curious");
    byTestId(r, "error-retry").props.onPress();
    hosts(r, "Pressable").find((p) => p.props.accessibilityLabel === "Home")!.props.onPress();
    expect([retry.mock.calls.length, home.mock.calls.length]).toEqual([1, 1]);
  });

  it("offline: Crystal asleep, and it retries on its own when the connection comes back, never in a loop", () => {
    const retry = vi.fn();
    const r = render(<OfflineState onRetry={retry} />);
    const all = textContent(byTestId(r, "offline-state"));
    for (const t of ["No connection", "You're offline", "Nothing is lost.", "Try again"]) expect(all).toContain(t);
    expect(r.root.findByType(Robin).props.mood).toBe("sleepy");
    emit(true); // the first report says "online" (the request failed anyway): no retry
    expect(retry).not.toHaveBeenCalled();
    emit(false);
    emit(true);
    expect(retry).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
    expect(net.listeners).toHaveLength(0);
  });
});

describe("LoadFailure", () => {
  it("picks the web's screen for the cause", () => {
    expect(render(<LoadFailure kind="network" onRetry={() => {}} onSignOut={() => {}} />).root.findAll((n) => n.props.testID === "offline-state").length).toBeGreaterThan(0);
    expect(render(<LoadFailure kind="unavailable" onRetry={() => {}} onSignOut={() => {}} />).root.findAll((n) => n.props.testID === "error-state").length).toBeGreaterThan(0);
  });

  it("an expired session goes back to sign in, once", () => {
    const out = vi.fn();
    const r = render(<LoadFailure kind="auth" onRetry={() => {}} onSignOut={out} />);
    act(() => r.update(<LoadFailure kind="auth" onRetry={() => {}} onSignOut={out} />));
    expect(out).toHaveBeenCalledTimes(1);
  });
});

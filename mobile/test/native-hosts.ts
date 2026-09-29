import { createElement, useRef, type ReactNode } from "react";

/**
 * Host stand-ins for react-native and react-native-svg, so the brand
 * components render under react-test-renderer in Node. Each is a plain host
 * element carrying its props, which the tests read back. Installed for every
 * test by native-mocks.setup.ts (vitest.config.mts setupFiles).
 */
export const RATIO = 2.625; // a Pixel 6 / 7: 412 × 915 at 420 dpi

function host(name: string) {
  const C = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement(name, props, typeof children === "function" ? (children as (s: { pressed: boolean }) => ReactNode)({ pressed: false }) : children);
  C.displayName = name;
  return C;
}

export const reactNativeMock = () => ({
  View: host("View"),
  Text: host("Text"),
  TextInput: host("TextInput"),
  Pressable: host("Pressable"),
  ActivityIndicator: host("ActivityIndicator"),
  PixelRatio: { get: () => RATIO },
  StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 / RATIO },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
});

export const svgMock = () => ({
  default: host("Svg"),
  Svg: host("Svg"),
  Path: host("Path"),
  G: host("G"),
});

/**
 * react-native-reanimated without a UI thread: shared values are plain boxes,
 * animated styles read them whenever a property is read, timings land on
 * their target at once (finishing their callback), and frame callbacks run
 * only when a test ticks them (tickFrames). `reducedMotion.value` stands in for the OS setting.
 */
export const reducedMotion = { value: false };
/** Every useFrameCallback, with each callback it has been handed (to catch a clock that re-registers). */
export type FakeFrameCallback = {
  active: boolean;
  setActive: (a: boolean) => void;
  callback: (frame: { timestamp: number }) => void;
  seen: Set<unknown>;
};
export const frameCallbacks: FakeFrameCallback[] = [];
/** The display ticking: every active frame callback runs at `timestamp` ms. */
export function tickFrames(timestamp: number) {
  for (const c of frameCallbacks) if (c.active) c.callback({ timestamp });
}
export const reanimatedMock = () => {
  const AnimatedView = host("Animated.View");
  return {
    default: { View: AnimatedView },
    useSharedValue: <T,>(v: T) => {
      return useRef({ value: v }).current;
    },
    // live, like the UI thread's: each property reads the shared values when it is read
    useAnimatedStyle: (fn: () => Record<string, unknown>) => {
      const style = {};
      for (const k of Object.keys(fn())) Object.defineProperty(style, k, { enumerable: true, get: () => fn()[k] });
      return style;
    },
    useReducedMotion: () => reducedMotion.value,
    useFrameCallback: (callback: (frame: { timestamp: number }) => void) => {
      const cb = useRef<FakeFrameCallback | null>(null);
      if (!cb.current) {
        const c: FakeFrameCallback = { active: false, setActive: (a) => void (c.active = a), callback, seen: new Set() };
        cb.current = c;
        frameCallbacks.push(c);
      }
      cb.current.callback = callback;
      cb.current.seen.add(callback);
      return cb.current;
    },
    withDelay: <T,>(_ms: number, animation: T) => animation,
    withTiming: <T,>(to: T, _config?: unknown, done?: (finished: boolean) => void) => {
      done?.(true);
      return to;
    },
  };
};

export const workletsMock = () => ({
  scheduleOnRN: <A extends unknown[]>(fn: (...args: A) => void, ...args: A) => fn(...args),
});

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
 * animated styles are computed once per render from them, timings land on
 * their target at once (finishing their callback), and frame callbacks never
 * tick. `reducedMotion.value` stands in for the OS setting.
 */
export const reducedMotion = { value: false };
export const frameCallbacks: { active: boolean }[] = [];
export const reanimatedMock = () => {
  const AnimatedView = host("Animated.View");
  return {
    default: { View: AnimatedView },
    useSharedValue: <T,>(v: T) => {
      return useRef({ value: v }).current;
    },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useReducedMotion: () => reducedMotion.value,
    useFrameCallback: () => {
      const cb = useRef<{ active: boolean; setActive: (a: boolean) => void } | null>(null);
      if (!cb.current) {
        const c = { active: false, setActive: (a: boolean) => void (c.active = a) };
        cb.current = c;
        frameCallbacks.push(c);
      }
      return cb.current;
    },
    withTiming: <T,>(to: T, _config?: unknown, done?: (finished: boolean) => void) => {
      done?.(true);
      return to;
    },
  };
};

export const workletsMock = () => ({
  scheduleOnRN: <A extends unknown[]>(fn: (...args: A) => void, ...args: A) => fn(...args),
});

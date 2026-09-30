import { createElement, useRef, type ReactNode } from "react";

/**
 * Host stand-ins for react-native and react-native-svg, so the brand
 * components render under react-test-renderer in Node. Each is a plain host
 * element carrying its props, which the tests read back. Installed for every
 * test by native-mocks.setup.ts (vitest.config.mts setupFiles).
 */
export const RATIO = 2.625; // a Pixel 6 / 7: 412 × 915 at 420 dpi
/** The window the stand-in reports (useWindowDimensions); tests may narrow it. */
export const windowSize = { width: 412, height: 915 };

function host(name: string) {
  const C = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement(name, props, typeof children === "function" ? (children as (s: { pressed: boolean }) => ReactNode)({ pressed: false }) : children);
  C.displayName = name;
  return C;
}

export const reactNativeMock = () => ({
  View: host("View"),
  Text: host("Text"),
  TextInput: Object.assign(host("TextInput"), { State: { currentlyFocusedInput: () => null } }),
  Modal: host("Modal"),
  Linking: { addEventListener: () => ({ remove: () => {} }), getInitialURL: async () => null, openURL: async () => {} },
  KeyboardAvoidingView: host("KeyboardAvoidingView"),
  Keyboard: { addListener: () => ({ remove: () => {} }), dismiss: () => {} },
  Pressable: host("Pressable"),
  ScrollView: host("ScrollView"),
  RefreshControl: host("RefreshControl"),
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => {} }) },
  ActivityIndicator: host("ActivityIndicator"),
  PixelRatio: { get: () => RATIO },
  useWindowDimensions: () => ({ ...windowSize, scale: RATIO, fontScale: 1 }),
  StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 / RATIO },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
});

export const svgMock = () => ({
  default: host("Svg"),
  Svg: host("Svg"),
  Path: host("Path"),
  G: host("G"),
  Rect: host("Rect"),
  Defs: host("Defs"),
  LinearGradient: host("LinearGradient"),
  Stop: host("Stop"),
});

/**
 * react-native-reanimated without a UI thread: shared values are plain boxes,
 * animated styles read them whenever a property is read, timings land on
 * their target at once (finishing their callback), and CSS animations are
 * plain style props the tests read back. `reducedMotion.value` stands in for the OS setting.
 */
export const reducedMotion = { value: false };
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
    withDelay: <T,>(_ms: number, animation: T) => animation,
    // CSS animation timing functions: a plain description the tests can read back
    steps: (n: number, modifier = "jump-end") => ({ steps: n, modifier }),
    cubicBezier: (x1: number, y1: number, x2: number, y2: number) => ({ cubicBezier: [x1, y1, x2, y2] }),
    createAnimatedComponent: <T,>(c: T) => c,
    withTiming: <T,>(to: T, _config?: unknown, done?: (finished: boolean) => void) => {
      done?.(true);
      return to;
    },
  };
};

export const workletsMock = () => ({
  scheduleOnRN: <A extends unknown[]>(fn: (...args: A) => void, ...args: A) => fn(...args),
});

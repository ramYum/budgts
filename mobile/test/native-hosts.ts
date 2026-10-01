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
  AccessibilityInfo: {
    announceForAccessibility: (message: string) => void announcements.push(message),
    isReduceMotionEnabled: async () => reducedMotion.value,
    addEventListener: (event: string, listener: (on: boolean) => void) => {
      if (event !== "reduceMotionChanged") return { remove: () => {} };
      reduceMotionListeners.add(listener);
      return { remove: () => void reduceMotionListeners.delete(listener) };
    },
  },
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
 * The OS's Reduce Motion / Remove animations setting. Setting `value` changes it as the OS does: AccessibilityInfo answers
 * with it and fires `reduceMotionChanged` to its listeners. `launch` is Reanimated's `useReducedMotion`, the reading it
 * took once when the bundle loaded; it follows `value` unless a test pins it (a setting changed after launch).
 */
const reduceMotionListeners = new Set<(on: boolean) => void>();
let osReducedMotion = false;
export const reducedMotion = {
  get value() {
    return osReducedMotion;
  },
  set value(on: boolean) {
    osReducedMotion = on;
    for (const listener of [...reduceMotionListeners]) listener(on);
  },
  launch: null as boolean | null,
};

/**
 * react-native-reanimated without a UI thread: shared values are plain boxes,
 * animated styles read them whenever a property is read, timings land on
 * their target at once (finishing their callback), and CSS animations are
 * plain style props the tests read back.
 */
/** What a component asked the screen reader to say (AccessibilityInfo.announceForAccessibility), in order. */
export const announcements: string[] = [];
/** Every shared-value timing and delay started, in order, with the `reduceMotion` each was given. */
export const animationCalls: { kind: "timing" | "delay"; to?: unknown; reduceMotion: unknown }[] = [];
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
    useReducedMotion: () => reducedMotion.launch ?? reducedMotion.value,
    ReduceMotion: { System: "system", Always: "always", Never: "never" },
    withDelay: <T,>(_ms: number, animation: T, reduceMotion?: unknown) => {
      animationCalls.push({ kind: "delay", reduceMotion });
      return animation;
    },
    // CSS animation timing functions: a plain description the tests can read back
    steps: (n: number, modifier = "jump-end") => ({ steps: n, modifier }),
    cubicBezier: (x1: number, y1: number, x2: number, y2: number) => ({ cubicBezier: [x1, y1, x2, y2] }),
    // UI-thread timing for shared-value animations (Crystal's roam): inert here, the plans are tested as plain functions
    Easing: { linear: (x: number) => x, steps: (n: number) => (x: number) => Math.floor(x * n) / n, bezier: () => (x: number) => x, out: (f: (x: number) => number) => f, in: (f: (x: number) => number) => f },
    cancelAnimation: () => {},
    useAnimatedReaction: () => {},
    withSequence: <T,>(...animations: T[]) => animations[animations.length - 1],
    withRepeat: <T,>(animation: T) => animation,
    createAnimatedComponent: <T,>(c: T) => c,
    withTiming: <T,>(to: T, config?: { reduceMotion?: unknown }, done?: (finished: boolean) => void) => {
      animationCalls.push({ kind: "timing", to, reduceMotion: config?.reduceMotion });
      done?.(true);
      return to;
    },
  };
};

export const workletsMock = () => ({
  scheduleOnRN: <A extends unknown[]>(fn: (...args: A) => void, ...args: A) => fn(...args),
});

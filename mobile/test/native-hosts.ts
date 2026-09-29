import { createElement, type ReactNode } from "react";

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

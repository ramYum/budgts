import { vi } from "vitest";

/**
 * What Crystal needs beyond the shared host stand-ins (test/native-hosts.ts):
 * her clock's timing, cancel and reaction (inert: there is no UI thread; the
 * plan and poses are tested as plain functions) and the screen-reader
 * announcement. Used by the files that render her.
 */
export const announce = vi.fn();

export async function reanimated() {
  return {
    ...(await import("../../test/native-hosts")).reanimatedMock(),
    Easing: { linear: (x: number) => x },
    cancelAnimation: () => {},
    useAnimatedReaction: () => {},
  };
}

export async function reactNative() {
  return {
    ...(await import("../../test/native-hosts")).reactNativeMock(),
    AccessibilityInfo: { announceForAccessibility: announce },
  };
}

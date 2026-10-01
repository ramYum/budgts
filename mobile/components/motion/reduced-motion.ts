import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion as useLaunchReading } from "react-native-reanimated";

/**
 * The app's one answer to "is motion off?" (iOS Reduce Motion; Android's Remove animations, an animation scale of 0):
 * Crystal, the money roll, the cells and every entrance read it here, so they all agree, as the web's one
 * `prefers-reduced-motion` does. Nothing else in the app asks the OS or Reanimated (test/reduced-motion-guard.test.ts).
 *
 * Reanimated's own `useReducedMotion` is a reading taken once, when the bundle loads, and never updated: a setting
 * changed while the app's process lives (Android keeps it across a relaunch from Recents) went unseen. So this starts
 * from that launch reading, which is there on the first frame, then asks the OS once and follows its
 * `reduceMotionChanged` events from then on (no polling); every reader re-renders when the setting flips.
 */

/** The OS's side: its answer when asked, and its change events (React Native's AccessibilityInfo). */
type ReduceMotionOs = {
  isReduceMotionEnabled: () => Promise<boolean>;
  addEventListener: (event: "reduceMotionChanged", listener: (on: boolean) => void) => unknown;
};

/**
 * The setting as last heard from `os`: null until it first says. It starts listening (and asks once) on its first
 * subscriber. Once any change event has arrived, the answer to that first question is stale and is ignored.
 */
export function reducedMotionStore(os: ReduceMotionOs) {
  let live: boolean | null = null;
  let started = false;
  let heardEvent = false;
  const listeners = new Set<() => void>();

  function set(on: boolean) {
    if (live === on) return;
    live = on;
    for (const listener of [...listeners]) listener();
  }

  return {
    subscribe(listener: () => void): () => void {
      if (!started) {
        started = true;
        os.addEventListener("reduceMotionChanged", (on) => {
          heardEvent = true;
          set(on);
        });
        void os.isReduceMotionEnabled().then((on) => {
          if (!heardEvent) set(on);
        });
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: (): boolean | null => live,
  };
}

const store = reducedMotionStore(AccessibilityInfo);

/** Whether motion is off right now: every animated component's gate (with it, each rests on its finished frame). */
export function useReducedMotion(): boolean {
  const launch = useLaunchReading();
  return useSyncExternalStore(store.subscribe, store.snapshot) ?? launch;
}

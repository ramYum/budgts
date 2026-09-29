import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { EggLoader } from "./brand/egg-loader";

/**
 * The app's one full-screen loading state: the egg loader over everything
 * while the app starts (fonts, the saved session), a sign-in link completes,
 * or the signed-in shell loads the profile. One loader for all of them, so
 * the egg keeps rolling across those handoffs instead of starting again on
 * each screen.
 *
 * Screens ask for it with `useLoadingScreen(loading, label)` and render
 * plain paper meanwhile. It never delays the app: the moment nothing is
 * loading, the screen underneath takes touches and the egg fades out.
 */

/** the hand-off to the first screen */
export const LOADING_FADE_OUT_MS = 200;
/** when a later load (a retry) brings it back */
const FADE_IN_MS = 120;
const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

type Holds = { hold: (id: string, label: string) => void; release: (id: string) => void };
const LoadingScreenContext = createContext<Holds | null>(null);

export function LoadingScreenProvider({
  loading,
  label = "Loading",
  onLayout,
  children,
}: {
  /** the provider owner's own loading (the root layout's start-up) */
  loading: boolean;
  label?: string;
  /** the loader's first layout: the native splash hides here, over the same egg */
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const [holds, setHolds] = useState<ReadonlyMap<string, string>>(new Map());
  const active = loading || holds.size > 0;
  const [shown, setShown] = useState(active);
  if (active && !shown) setShown(true);

  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    if (active) opacity.value = withTiming(1, { duration: FADE_IN_MS });
    else
      opacity.value = withTiming(0, { duration: LOADING_FADE_OUT_MS }, (finished) => {
        "worklet";
        if (finished) scheduleOnRN(setShown, false);
      });
    // (opacity is a stable shared value)
  }, [active]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const hold = useCallback((id: string, l: string) => setHolds((h) => new Map(h).set(id, l)), []);
  const release = useCallback(
    (id: string) =>
      setHolds((h) => {
        if (!h.has(id)) return h;
        const next = new Map(h);
        next.delete(id);
        return next;
      }),
    [],
  );
  const value = useMemo(() => ({ hold, release }), [hold, release]);
  // the most recent screen's words for what is loading
  const current = [...holds.values()].pop() ?? label;

  return (
    <LoadingScreenContext.Provider value={value}>
      {children}
      {shown ? (
        <Animated.View testID="loading-screen" style={[FILL, fade]} pointerEvents={active ? "auto" : "none"}>
          <EggLoader label={current} onLayout={onLayout} />
        </Animated.View>
      ) : null}
    </LoadingScreenContext.Provider>
  );
}

/** Show the loading screen while `loading`, described to screen readers as `label`. */
export function useLoadingScreen(loading: boolean, label: string): void {
  const holds = useContext(LoadingScreenContext);
  if (!holds) throw new Error("useLoadingScreen needs a <LoadingScreenProvider> above it (app/_layout.tsx)");
  const id = useId();
  // Before paint, so a screen that mounts loading never shows a frame without the loader.
  useLayoutEffect(() => {
    if (!loading) return;
    holds.hold(id, label);
    return () => holds.release(id);
  }, [holds, id, loading, label]);
}

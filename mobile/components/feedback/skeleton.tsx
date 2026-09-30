import { useState } from "react";
import { View, type DimensionValue, type LayoutChangeEvent } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ROLE } from "../../lib/brand/shared";
import { PixelFrame } from "../brand/pixel-frame";

/** The web's `.skeleton` highlight at the middle of its sweep. */
export const SKELETON_HIGHLIGHT = "#e8e8e8";
export const SKELETON_SWEEP_MS = 1400;

/**
 * Where the sweep's highlight band sits, in box widths: the web paints a 300%
 * wide gradient (plain to 40%, #e8e8e8 at 50%, plain from 60%) and slides it
 * from `background-position: 100%` to `0`, so the band (0.6 box widths wide)
 * travels from 0.8 widths left of the box to 1.2 widths along it.
 */
export const SWEEP_FROM = -0.8;
export const SWEEP_TO = 1.2;
export const BAND = 0.6;

/**
 * One loading block (web `.skeleton`): the sunken surface with a light sweep
 * crossing it every 1.4s, linear, forever; still with motion off.
 */
export function Skeleton({ width, height }: { width: DimensionValue; height: number }) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  function measure(e: LayoutChangeEvent) {
    const next = e.nativeEvent.layout.width;
    setW((prev) => (prev === next ? prev : next));
  }
  return (
    <View onLayout={measure} style={{ width, height, backgroundColor: ROLE.surface2, overflow: "hidden" }}>
      {w > 0 && !reduced ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: BAND * w,
            animationName: { from: { transform: [{ translateX: SWEEP_FROM * w }] }, to: { transform: [{ translateX: SWEEP_TO * w }] } },
            animationDuration: `${SKELETON_SWEEP_MS}ms`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          }}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={ROLE.surface2} />
                <Stop offset="0.5" stopColor={SKELETON_HIGHLIGHT} />
                <Stop offset="1" stopColor={ROLE.surface2} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#sweep)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * The loading screen every signed-in page shows while its data arrives (web
 * src/app/(app)/(dashboard)/loading.tsx, phone): a title and a line, the lead
 * card, then a list card of four rows. Shaped like what's coming, so a tap
 * never feels dead.
 */
export function ScreenSkeleton() {
  return (
    <View testID="loading-skeleton" accessible accessibilityLabel="Loading…" accessibilityState={{ busy: true }} accessibilityLiveRegion="polite">
      <View style={{ marginBottom: 24, gap: 8 }}>
        <Skeleton width={192} height={24} />
        <Skeleton width={160} height={16} />
      </View>
      <PixelFrame frame="px-card-raised" style={{ padding: 8, gap: 16 }}>
        <Skeleton width={96} height={16} />
        <Skeleton width={224} height={40} />
        <View style={{ maxWidth: 444 }}>
          <Skeleton width="100%" height={12} />
        </View>
      </PixelFrame>
      <PixelFrame frame="px-card" style={{ marginTop: 40, padding: 8, gap: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Skeleton width={40} height={40} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width="40%" height={16} />
              <Skeleton width="100%" height={8} />
            </View>
          </View>
        ))}
      </PixelFrame>
    </View>
  );
}

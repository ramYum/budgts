import { memo, useMemo } from "react";
import { PixelRatio, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import Animated, { steps, useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import {
  EGG_FRAMES,
  EGG_GROUND_PALETTE,
  EGG_STEP_MS,
  MOTION,
  ROLE,
  eggPathFor,
  type EggFrame,
  type EggGround,
  type EggStep,
} from "../../lib/brand/shared";
import { snap, snapPath } from "../../lib/brand/snap";
import { useMotionTiming } from "../../lib/motion/parity-clock";

/**
 * The loading screen: Crystal's egg rolling end over end along a row of the
 * brand's square progress cells (the art and the laps: src/lib/brand/egg-art.ts;
 * docs/BRAND_GUIDELINES.md → Motion). It opens exactly as the native splash
 * left off (the same resting egg, the same size, the middle of the screen),
 * the cells step in beneath it left to right, and it rolls from the first step.
 *
 * The lap fits the window: half a turn each way where that keeps 16px of
 * paper to both edges (360dp phones and up), a quarter turn each way in
 * narrower ones (an iPhone SE with Display Zoom, Android at its largest
 * display size). The loader fills the window, so the window's width is its
 * width. Every lap starts and ends on the splash's resting frame.
 *
 * Every movement is a Reanimated CSS keyframe animation with `steps()`
 * timing, the web's sprite motion. It is declared on the views themselves,
 * so the UI thread plays it from the frame they mount, whatever the JS
 * thread is busy with at start-up (a frame clock switched on from a React
 * effect waited for JS: the egg stood still for seconds on a busy start).
 * Each frame layer shows only on its steps, at their place.
 *
 * Indeterminate on purpose: the cells it rolls off fade ink, then grey, then
 * back to the track behind it, a chase, never a bar that fills (a full bar
 * would look stuck). No text. Under Reduce Motion the egg stands on a still,
 * full row.
 */

/** px per art cell: the loader's one grain (the splash image is drawn at it too). */
export const EGG_SCALE = 6;

const REST = EGG_FRAMES[0]!;

/** The frame as one path per colour, in art cells (one-cell-tall runs). */
function framePaths(frame: EggFrame): [fill: string, d: string][] {
  const byFill = new Map<string, string>();
  for (const r of frame.runs) byFill.set(r.fill, `${byFill.get(r.fill) ?? ""}M${r.x} ${r.y}h${r.w}v1h-${r.w}z`);
  return [...byFill];
}

export type LapKeyframe = { opacity: number; transform: [{ translateX: number }] };

/**
 * A lap as keyframes: one at the start of each step (k / count of the way
 * through), held until the next by `steps(1, jump-end)`. `at(k)` is step k's
 * style; the closing keyframe repeats step 0, where the lap wraps.
 */
export function lapKeyframes(count: number, at: (k: number) => LapKeyframe): Record<string, LapKeyframe> {
  const frames: Record<string, LapKeyframe> = {};
  for (let k = 0; k <= count; k++) frames[`${((k * 100) / count).toFixed(4)}%`] = at(k % count);
  return frames;
}

/** Memoised: the loading screen re-renders on every hold and label change, and the egg must roll straight through them. */
export const EggLoader = memo(function EggLoader({ label = "Loading", onLayout }: { label?: string; onLayout?: (e: LayoutChangeEvent) => void }) {
  const reduceMotion = useReducedMotion();
  const ratio = PixelRatio.get();
  const { width } = useWindowDimensions();
  const path = eggPathFor(width, EGG_SCALE);
  const { loop, ground } = path;

  // Every position on the device-pixel grid, worked out once, so the art never lands between pixels.
  const px = useMemo(
    () => ({
      frameX: loop.map((s) => snap(s.x * EGG_SCALE, ratio)),
      cellX: Array.from({ length: ground.count + 1 }, (_, i) => snap(i * (ground.cell + ground.gap) * EGG_SCALE, ratio)),
    }),
    [loop, ground, ratio],
  );

  return (
    <View
      onLayout={onLayout}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: ROLE.bg }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      {/* The resting egg's box, centred on the screen as the splash centres it. */}
      <View
        testID="egg-stage"
        style={{ width: REST.w * EGG_SCALE, height: REST.h * EGG_SCALE }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ground key={path.id} ground={ground} loop={loop} ratio={ratio} cellX={px.cellX} still={reduceMotion} />
        {EGG_FRAMES.map((frame, i) => (
          <FrameLayer key={`${path.id}-${frame.angle}`} index={i} frame={frame} ratio={ratio} loop={loop} frameX={px.frameX} still={reduceMotion} />
        ))}
      </View>
    </View>
  );
});

/** A lap's timing: the loop's length, repeating, one step at a time, from mount (or the parity clock's instant). */
function useLapTiming(loop: EggStep[]) {
  const timing = useMotionTiming(0);
  return {
    animationDuration: `${loop.length * EGG_STEP_MS}ms` as const,
    animationIterationCount: "infinite" as const,
    animationTimingFunction: steps(1, "jump-end"),
    ...timing,
  };
}

/** One pre-drawn frame; shown only on the steps that use it, at that step's place. */
const FrameLayer = memo(function FrameLayer({
  index,
  frame,
  ratio,
  loop,
  frameX,
  still,
}: {
  index: number;
  frame: EggFrame;
  ratio: number;
  loop: EggStep[];
  frameX: number[];
  still: boolean;
}) {
  const paths = useMemo(() => framePaths(frame).map(([fill, d]) => [fill, snapPath(d, { unit: EGG_SCALE, ratio })] as const), [frame, ratio]);
  const top = (REST.h - frame.h) * EGG_SCALE; // every frame stands on the resting egg's ground line
  const lap = useMemo(
    () => lapKeyframes(loop.length, (k) => ({ opacity: loop[k]!.frame === index ? 1 : 0, transform: [{ translateX: frameX[k]! }] })),
    [loop, frameX, index],
  );
  const timing = useLapTiming(loop);
  // The resting style (and Reduce Motion's): the resting frame alone, where the splash left it.
  const rest: LapKeyframe = { opacity: index === 0 ? 1 : 0, transform: [{ translateX: 0 }] };
  return (
    <Animated.View
      testID={`egg-frame-${frame.angle}`}
      style={[{ position: "absolute", left: 0, top }, rest, still ? null : { animationName: lap, ...timing }]}
    >
      <Svg width={frame.w * EGG_SCALE} height={frame.h * EGG_SCALE}>
        {paths.map(([fill, d]) => (
          <Path key={fill} d={d} fill={fill} />
        ))}
      </Svg>
    </Animated.View>
  );
});

/** The row of cells: the track, the two cells the egg just rolled off (ink, then grey), and the cover the sweep draws back. */
function Ground({
  ground,
  loop,
  ratio,
  cellX,
  still,
}: {
  ground: EggGround;
  loop: EggStep[];
  ratio: number;
  cellX: number[];
  still: boolean;
}) {
  const pitch = ground.cell + ground.gap;
  const size = snap(ground.cell * EGG_SCALE, ratio);
  const width = ground.width * EGG_SCALE;
  const track = useMemo(() => {
    let d = "";
    for (let i = 0; i < ground.count; i++) d += `M${i * pitch} 0h${ground.cell}v${ground.cell}h-${ground.cell}z`;
    return snapPath(d, { unit: EGG_SCALE, ratio });
  }, [ground, pitch, ratio]);

  const trail = useMemo(() => {
    const lapOf = (k: 0 | 1) =>
      lapKeyframes(loop.length, (s) => {
        const t = loop[s]!.trail[k];
        return { opacity: t === undefined ? 0 : 1, transform: [{ translateX: cellX[t ?? 0]! }] };
      });
    return { recent: lapOf(0), older: lapOf(1) };
  }, [loop, cellX]);
  const lapTiming = useLapTiming(loop);
  const sweepTiming = useMotionTiming(0);
  const swept = cellX[ground.count]!;

  const cell = { position: "absolute", top: 0, left: 0, width: size, height: size, opacity: 0 } as const;
  return (
    <View
      testID="egg-ground"
      style={{ position: "absolute", left: ground.left * EGG_SCALE, top: (REST.h + ground.drop) * EGG_SCALE, width, height: size }}
    >
      <Svg width={width} height={size}>
        <Path d={track} fill={EGG_GROUND_PALETTE.track} />
      </Svg>
      <Animated.View
        testID="egg-ground-older"
        style={[cell, { backgroundColor: EGG_GROUND_PALETTE.older }, still ? null : { animationName: trail.older, ...lapTiming }]}
      />
      <Animated.View
        testID="egg-ground-recent"
        style={[cell, { backgroundColor: EGG_GROUND_PALETTE.recent }, still ? null : { animationName: trail.recent, ...lapTiming }]}
      />
      {/* Paper over the cells not yet arrived: it slides off one cell at a time (`cells-sweep`), once. At rest it sits past the row's end. */}
      <Animated.View
        testID="egg-ground-cover"
        style={[
          { position: "absolute", top: 0, left: 0, width, height: size, backgroundColor: ROLE.bg, transform: [{ translateX: swept }] },
          still
            ? null
            : {
                animationName: { from: { transform: [{ translateX: 0 }] }, to: { transform: [{ translateX: swept }] } },
                animationDuration: `${MOTION.cellsSweepMs}ms`,
                animationTimingFunction: steps(ground.count, "jump-end"),
                animationFillMode: "backwards",
                ...sweepTiming,
              },
        ]}
      />
    </View>
  );
}

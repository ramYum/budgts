import { memo, useMemo } from "react";
import { PixelRatio, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, type SharedValue } from "react-native-reanimated";
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
import { useSteppedClock } from "../../lib/motion/stepped";

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
 * Indeterminate on purpose: the cells it rolls off fade ink, then grey, then
 * back to the track behind it, a chase, never a bar that fills (a full bar
 * would look stuck). No text. All motion runs on the UI thread, whole frames
 * at a time; under Reduce Motion the egg stands on a still row.
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

/** Memoised: the loading screen re-renders on every hold and label change, and the egg must roll straight through them. */
export const EggLoader = memo(function EggLoader({ label = "Loading", onLayout }: { label?: string; onLayout?: (e: LayoutChangeEvent) => void }) {
  const reduceMotion = useReducedMotion();
  const ratio = PixelRatio.get();
  const { width } = useWindowDimensions();
  const path = eggPathFor(width, EGG_SCALE);
  const { loop, ground } = path;

  const loopClock = useMemo(() => ({ stepMs: EGG_STEP_MS, intro: 0, loop: loop.length }), [loop]);
  const sweepClock = useMemo(() => ({ stepMs: MOTION.cellsSweepMs / ground.count, intro: ground.count, loop: 1 }), [ground]);
  const loopStep = useSteppedClock(loopClock, !reduceMotion);
  const sweepStep = useSteppedClock(sweepClock, !reduceMotion);

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
        <Ground key={path.id} ground={ground} loop={loop} ratio={ratio} cellX={px.cellX} loopStep={loopStep} sweepStep={sweepStep} still={reduceMotion} />
        {EGG_FRAMES.map((frame, i) => (
          <FrameLayer key={frame.angle} index={i} frame={frame} ratio={ratio} loop={loop} frameX={px.frameX} loopStep={loopStep} />
        ))}
      </View>
    </View>
  );
});

/** One pre-drawn frame; shown only on the steps that use it, at that step's place. */
const FrameLayer = memo(function FrameLayer({
  index,
  frame,
  ratio,
  loop,
  frameX,
  loopStep,
}: {
  index: number;
  frame: EggFrame;
  ratio: number;
  loop: EggStep[];
  frameX: number[];
  loopStep: SharedValue<number>;
}) {
  const paths = useMemo(() => framePaths(frame).map(([fill, d]) => [fill, snapPath(d, { unit: EGG_SCALE, ratio })] as const), [frame, ratio]);
  const top = (REST.h - frame.h) * EGG_SCALE; // every frame stands on the resting egg's ground line
  const style = useAnimatedStyle(() => {
    const i = Math.min(loopStep.value, loop.length - 1);
    return { opacity: loop[i]!.frame === index ? 1 : 0, transform: [{ translateX: frameX[i]! }] };
  });
  return (
    <Animated.View testID={`egg-frame-${frame.angle}`} style={[{ position: "absolute", left: 0, top }, style]}>
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
  loopStep,
  sweepStep,
  still,
}: {
  ground: EggGround;
  loop: EggStep[];
  ratio: number;
  cellX: number[];
  loopStep: SharedValue<number>;
  sweepStep: SharedValue<number>;
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

  const trailCell = (k: number) => {
    "worklet";
    const t = still ? undefined : loop[Math.min(loopStep.value, loop.length - 1)]!.trail[k];
    return { opacity: t === undefined ? 0 : 1, transform: [{ translateX: cellX[t ?? 0]! }] };
  };
  const recent = useAnimatedStyle(() => trailCell(0));
  const older = useAnimatedStyle(() => trailCell(1));
  // paper over the cells not yet arrived; it slides off one cell at a time
  const cover = useAnimatedStyle(() => ({ transform: [{ translateX: cellX[still ? ground.count : Math.min(sweepStep.value, ground.count)]! }] }));

  const cell = { position: "absolute", top: 0, left: 0, width: size, height: size } as const;
  return (
    <View
      testID="egg-ground"
      style={{ position: "absolute", left: ground.left * EGG_SCALE, top: (REST.h + ground.drop) * EGG_SCALE, width, height: size }}
    >
      <Svg width={width} height={size}>
        <Path d={track} fill={EGG_GROUND_PALETTE.track} />
      </Svg>
      <Animated.View testID="egg-ground-older" style={[cell, { backgroundColor: EGG_GROUND_PALETTE.older }, older]} />
      <Animated.View testID="egg-ground-recent" style={[cell, { backgroundColor: EGG_GROUND_PALETTE.recent }, recent]} />
      <Animated.View testID="egg-ground-cover" style={[{ position: "absolute", top: 0, left: 0, width, height: size, backgroundColor: ROLE.bg }, cover]} />
    </View>
  );
}

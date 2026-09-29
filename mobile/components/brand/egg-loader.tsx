import { memo, useMemo } from "react";
import { PixelRatio, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { EGG_FRAMES, EGG_GROUND, EGG_GROUND_PALETTE, EGG_LOOP, EGG_STEP_MS, MOTION, ROLE, type EggFrame } from "../../lib/brand/shared";
import { snap, snapPath } from "../../lib/brand/snap";
import { useSteppedClock } from "../../lib/motion/stepped";

/**
 * The loading screen: Crystal's egg rolling end over end along a row of the
 * brand's square progress cells (the art and the loop: src/lib/brand/egg-art.ts;
 * docs/BRAND_GUIDELINES.md → Motion). It opens exactly as the native splash
 * left off (the same resting egg, the same size, the middle of the screen),
 * the cells step in beneath it left to right, then it rolls.
 *
 * Indeterminate on purpose: one cell lights under the egg and the one it
 * just left fades, a chase, never a bar that fills (a full bar would look
 * stuck). No text. All motion runs on the UI thread, whole frames at a time;
 * under Reduce Motion the egg rests on a still row.
 */

/** px per art cell: Crystal's grain on sign-in, so the brand reads as one. */
export const EGG_SCALE = 4;

const REST = EGG_FRAMES[0]!;
const PITCH = EGG_GROUND.cell + EGG_GROUND.gap;
/** the ground row's top, below the resting egg's box */
const GROUND_TOP = (REST.h + EGG_GROUND.drop) * EGG_SCALE;
const SWEEP = { stepMs: MOTION.cellsSweepMs / EGG_GROUND.count, intro: EGG_GROUND.count, loop: 1 };
const LOOP = { stepMs: EGG_STEP_MS, intro: 0, loop: EGG_LOOP.length };

/** The frame as one path per colour, in art cells (one-cell-tall runs). */
function framePaths(frame: EggFrame): [fill: string, d: string][] {
  const byFill = new Map<string, string>();
  for (const r of frame.runs) byFill.set(r.fill, `${byFill.get(r.fill) ?? ""}M${r.x} ${r.y}h${r.w}v1h-${r.w}z`);
  return [...byFill];
}

export function EggLoader({ label = "Loading", onLayout }: { label?: string; onLayout?: (e: LayoutChangeEvent) => void }) {
  const reduceMotion = useReducedMotion();
  const ratio = PixelRatio.get();
  const loopStep = useSteppedClock(LOOP, !reduceMotion);
  const sweepStep = useSteppedClock(SWEEP, !reduceMotion);

  // Every position on the device-pixel grid, worked out once, so the art never lands between pixels.
  const px = useMemo(
    () => ({
      frameX: EGG_LOOP.map((s) => snap(s.x * EGG_SCALE, ratio)),
      cellX: Array.from({ length: EGG_GROUND.count + 1 }, (_, i) => snap(i * PITCH * EGG_SCALE, ratio)),
    }),
    [ratio],
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
        <Ground ratio={ratio} cellX={px.cellX} loopStep={loopStep} sweepStep={sweepStep} still={reduceMotion} />
        {EGG_FRAMES.map((frame, i) => (
          <FrameLayer key={frame.angle} index={i} frame={frame} ratio={ratio} frameX={px.frameX} loopStep={loopStep} />
        ))}
      </View>
    </View>
  );
}

/** One pre-drawn frame; shown only on the steps that use it, at that step's place. */
const FrameLayer = memo(function FrameLayer({
  index,
  frame,
  ratio,
  frameX,
  loopStep,
}: {
  index: number;
  frame: EggFrame;
  ratio: number;
  frameX: number[];
  loopStep: SharedValue<number>;
}) {
  const paths = useMemo(() => framePaths(frame).map(([fill, d]) => [fill, snapPath(d, { unit: EGG_SCALE, ratio })] as const), [frame, ratio]);
  const top = (REST.h - frame.h) * EGG_SCALE; // every frame stands on the resting egg's ground line
  const style = useAnimatedStyle(() => {
    const step = EGG_LOOP[loopStep.value]!;
    return { opacity: step.frame === index ? 1 : 0, transform: [{ translateX: frameX[loopStep.value]! }] };
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

/** The row of cells: the track, the lit cell under the egg, the one it just left, and the cover the sweep draws back. */
function Ground({
  ratio,
  cellX,
  loopStep,
  sweepStep,
  still,
}: {
  ratio: number;
  cellX: number[];
  loopStep: SharedValue<number>;
  sweepStep: SharedValue<number>;
  still: boolean;
}) {
  const size = snap(EGG_GROUND.cell * EGG_SCALE, ratio);
  const width = EGG_GROUND.width * EGG_SCALE;
  const track = useMemo(() => {
    let d = "";
    for (let i = 0; i < EGG_GROUND.count; i++) d += `M${i * PITCH} 0h${EGG_GROUND.cell}v${EGG_GROUND.cell}h-${EGG_GROUND.cell}z`;
    return snapPath(d, { unit: EGG_SCALE, ratio });
  }, [ratio]);

  const lit = useAnimatedStyle(() => ({ transform: [{ translateX: cellX[EGG_LOOP[loopStep.value]!.lit]! }] }));
  const trail = useAnimatedStyle(() => {
    const t = EGG_LOOP[loopStep.value]!.trail;
    return { opacity: t < 0 ? 0 : 1, transform: [{ translateX: cellX[Math.max(0, t)]! }] };
  });
  // paper over the cells not yet arrived; it slides off one cell at a time
  const cover = useAnimatedStyle(() => ({ transform: [{ translateX: cellX[still ? EGG_GROUND.count : sweepStep.value]! }] }));

  const cell = { position: "absolute", top: 0, left: 0, width: size, height: size } as const;
  return (
    <View testID="egg-ground" style={{ position: "absolute", left: EGG_GROUND.left * EGG_SCALE, top: GROUND_TOP, width, height: size }}>
      <Svg width={width} height={size}>
        <Path d={track} fill={EGG_GROUND_PALETTE.track} />
      </Svg>
      <Animated.View testID="egg-ground-trail" style={[cell, { backgroundColor: EGG_GROUND_PALETTE.trail }, trail]} />
      <Animated.View testID="egg-ground-lit" style={[cell, { backgroundColor: EGG_GROUND_PALETTE.lit }, lit]} />
      <Animated.View testID="egg-ground-cover" style={[{ position: "absolute", top: 0, left: 0, width, height: size, backgroundColor: ROLE.bg }, cover]} />
    </View>
  );
}

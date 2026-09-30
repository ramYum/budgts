import { useMemo, type ReactNode } from "react";
import { PixelRatio, View } from "react-native";
import Animated, { type CSSAnimationKeyframes, type AnimatedStyle } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { StyleProp, ViewStyle } from "react-native";
import { ROBIN_ART, type RobinMood } from "../../lib/brand/shared";
import { robinLayer, robinSize, type RobinLayer } from "../../lib/brand/robin-paths";
import { snapPath } from "../../lib/brand/snap";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import {
  ARRIVE_AT,
  ARRIVE_FLAP,
  ARRIVE_FLAP_MS,
  BLINK,
  BLINK_MS,
  CHIRP_MS,
  FLICKER,
  FLICKER_MS,
  HOLD,
  LOOP_BEAK,
  LOOP_BEAK_OPEN,
  LOOP_CHIRP,
  REACT_BEAK,
  REACT_BEAK_MS,
  REACT_BEAK_OPEN,
  REACT_CHIRP,
  REACT_FLAP,
  REACT_MS,
} from "./keyframes";

/** Crystal on Home is 44px tall: two px per art cell (52 × 44). */
export const SCALE = 2;
export const BIRD = robinSize(SCALE);

/** One layer of her art, alone on a full-size canvas, so each layer can carry its own animation (the web's `robin-*` groups). */
function Layer({ mood, layer }: { mood: RobinMood; layer: RobinLayer }) {
  const ratio = PixelRatio.get();
  const paths = useMemo(
    () => robinLayer(mood, layer).map(([fill, d]) => [fill, snapPath(d, { unit: SCALE, dx: SCALE, dy: SCALE, ratio })] as const),
    [mood, layer, ratio],
  );
  return (
    <Svg width={BIRD.width} height={BIRD.height}>
      {paths.map(([fill, d]) => (
        <Path key={fill} d={d} fill={fill} />
      ))}
    </Svg>
  );
}

const FILL = { position: "absolute", left: 0, top: 0, width: BIRD.width, height: BIRD.height } as const;

/** The eye's own centre (the web's `transform-box: fill-box; transform-origin: center`), in px. */
function eyeCentre(mood: RobinMood): string {
  const eye = ROBIN_ART[mood].eye;
  const xs = eye.flatMap((r) => [r.x, r.x + r.w]);
  const ys = eye.flatMap((r) => [r.y, r.y + 1]);
  // the art's grid starts at (-1, -1)
  const cx = ((Math.min(...xs) + Math.max(...xs)) / 2 + 1) * SCALE;
  const cy = ((Math.min(...ys) + Math.max(...ys)) / 2 + 1) * SCALE;
  return `${cx}px ${cy}px`;
}

function Anim({ name, ms, delay = 0, loop = false, hold = true, style, children }: {
  name: CSSAnimationKeyframes;
  ms: number;
  delay?: number;
  loop?: boolean;
  hold?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const timing = useMotionTiming(delay);
  return (
    <Animated.View
      style={[
        FILL,
        style,
        {
          animationName: name,
          animationDuration: `${ms}ms`,
          animationIterationCount: loop ? "infinite" : 1,
          animationFillMode: "backwards",
          ...(hold ? { animationTimingFunction: HOLD } : { animationTimingFunction: "linear" }),
          ...timing,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Crystal drawn as the web's layered robin (src/components/mascot.tsx `flaps`),
 * each layer moving as the web's does: the beak chirps every 4s (happy) or
 * the "?" flickers (curious), the eye blinks, the wing beats on the way down
 * (`arriving`), through a tap's jump (`reacting`, with a chirp back), and on
 * every hop (`hopWing`, from the walk's worklet). Remounted per tap, as the
 * web's `key={taps}` restarts her loops.
 */
export function CrystalArt({
  mood,
  arriving,
  reacting,
  hopWing,
}: {
  mood: "happy" | "curious";
  arriving: boolean;
  reacting: boolean;
  hopWing: AnimatedStyle<ViewStyle>;
}) {
  const chirps = mood === "happy";
  return (
    <View style={{ width: BIRD.width, height: BIRD.height }}>
      <View style={FILL}>
        <Layer mood={mood} layer="body" />
      </View>
      {/* the shut beak: off while the loop's or a tap's chirp has it open */}
      {chirps ? (
        <Anim name={LOOP_BEAK} ms={CHIRP_MS} loop>
          {reacting ? (
            <Anim name={REACT_BEAK} ms={REACT_BEAK_MS}>
              <Layer mood={mood} layer="beak" />
            </Anim>
          ) : (
            <Layer mood={mood} layer="beak" />
          )}
        </Anim>
      ) : (
        <View style={FILL}>
          <Layer mood={mood} layer="beak" />
        </View>
      )}
      {chirps ? (
        <Anim name={LOOP_BEAK_OPEN} ms={CHIRP_MS} loop>
          <Layer mood={mood} layer="beakOpen" />
        </Anim>
      ) : null}
      {chirps && reacting ? (
        <Anim name={REACT_BEAK_OPEN} ms={REACT_BEAK_MS} style={{ opacity: 0 }}>
          <Layer mood={mood} layer="beakOpen" />
        </Anim>
      ) : null}
      {/* the raised wing, hidden at rest: the arrival's beats, a tap's, a hop's */}
      {arriving ? (
        <Anim name={ARRIVE_FLAP} ms={ARRIVE_FLAP_MS} delay={ARRIVE_AT} style={{ opacity: 0 }}>
          <Layer mood={mood} layer="wingUp" />
        </Anim>
      ) : null}
      {reacting ? (
        <Anim name={REACT_FLAP} ms={REACT_MS} style={{ opacity: 0 }}>
          <Layer mood={mood} layer="wingUp" />
        </Anim>
      ) : null}
      <Animated.View style={[FILL, hopWing]}>
        <Layer mood={mood} layer="wingUp" />
      </Animated.View>
      <Anim name={BLINK} ms={BLINK_MS} loop hold={false} style={{ transformOrigin: eyeCentre(mood) }}>
        <Layer mood={mood} layer="eye" />
      </Anim>
      {/* the chirp marks sound with each chirp; the "?" flickers */}
      {chirps ? (
        <Anim name={LOOP_CHIRP} ms={CHIRP_MS} loop>
          <Layer mood={mood} layer="extra" />
        </Anim>
      ) : (
        <Anim name={FLICKER} ms={FLICKER_MS} loop>
          <Layer mood={mood} layer="extra" />
        </Anim>
      )}
      {chirps && reacting ? (
        <Anim name={REACT_CHIRP} ms={REACT_BEAK_MS} style={{ opacity: 0 }}>
          <Layer mood={mood} layer="extra" />
        </Anim>
      ) : null}
    </View>
  );
}

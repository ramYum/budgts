import { useMemo, useState, type ReactNode } from "react";
import { PixelRatio, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { G, Path } from "react-native-svg";
import { MOTION, ROBIN_ART, ROBIN_H, ROBIN_W, type RobinMood } from "../../lib/brand/shared";
import { robinLayer, robinSize, type RobinLayer } from "../../lib/brand/robin-paths";
import { snapPath } from "../../lib/brand/snap";
import { usePlay } from "../motion/reveal";
import { useKeyframes, type Keyframes } from "../tour/motion";
import { ROBIN_BEAK, ROBIN_BEAK_OPEN, ROBIN_BLINK, ROBIN_CHIRP, ROBIN_FLICKER, ROBIN_HOP, STEP1, STEPS4 } from "./robin-keyframes";

/** A one-off move a caller plays on one of her layers (the perch's arrival flap, a tap's chirp back): web keyframes. */
export type RobinFlourish = { kf: Keyframes; ms: number; delay?: number; easing?: unknown };

/**
 * A caller's choreography on top of her own loops, the web's `flaps` robin as the Home perch drives it:
 * - `beak`: plays on the shut beak inside her chirp loop (a tap's chirp back hides it while the beak is open);
 * - `beakOpen`, `extra`: an open beak / her marks, hidden at rest, shown by the move;
 * - `wingUp`: each a raised wing, hidden at rest, shown by its move (the arrival's beats, a tap's flaps);
 * - `wingStyle`: one more raised wing under a UI-thread animated style (the walk's hop wing).
 * Key the robin to replay them (the web's `key={taps}`).
 */
export type RobinChoreography = {
  beak?: RobinFlourish;
  beakOpen?: RobinFlourish;
  extra?: RobinFlourish;
  wingUp?: RobinFlourish[];
  wingStyle?: StyleProp<ViewStyle>;
};

/**
 * Crystal, the Budgts robin, from the one art source (src/lib/brand/robin-art.ts)
 * at a whole number of px per art cell (`scale`: 4 draws her 88px tall, the
 * sign-in size), or at the web's `size` (her height in px, any number: each
 * cell then spans a fractional px, as the web's viewBox does), every cell edge
 * on a whole device pixel (lib/brand/snap.ts), the web's crispEdges.
 *
 * She is alive wherever she shows, as on the web (globals.css `robin-*`): a
 * single then a double blink every 4.8s, and in the chirping moods (normal,
 * happy) a two-note chirp every 4s (`chirpMs`, the web's `--robin-chirp`),
 * the beak opening twice while her marks sound; the curious "?" and sleepy
 * "z" flicker instead. Moving, she is drawn layer by layer (each layer its own
 * drawing, stacked in the web's paint order) so each layer carries its own
 * keyframes. `hopOnTap` adds the web's hover hop (4px, 360ms in four steps) on
 * a tap; `choreography` lets a caller (Crystal on Home) play its moves on her
 * layers. Under Reduce Motion, while her block waits to play, or with
 * `animated={false}`, she rests in one drawing: beak shut and her marks
 * showing, the web's motion-off frame. `beakOpen` / `wingUp` draw those frames
 * still.
 *
 * Decorative unless given a `title`, like the web's <Robin>.
 */
export function Robin({
  mood = "normal",
  scale = 4,
  size,
  title,
  beakOpen = false,
  wingUp = false,
  animated = true,
  chirpMs = MOTION.robinChirpMs,
  hopOnTap = false,
  choreography,
  testID,
}: {
  mood?: RobinMood;
  scale?: number;
  /** her height in px, the web's <Robin size>; wins over `scale` (width rounds as the web's does) */
  size?: number;
  title?: string;
  /** mid-chirp frame: the open beak replaces the shut one (and her own chirp stops) */
  beakOpen?: boolean;
  /** a flap's raised-wing frame over the resting wing */
  wingUp?: boolean;
  /** her blink and chirp (the web's `animated`) */
  animated?: boolean;
  /** one chirp cycle (the web's `--robin-chirp`, 4s) */
  chirpMs?: number;
  /** hop on a tap, the web's hover hop */
  hopOnTap?: boolean;
  /** a caller's moves on top of her own loops (Crystal on Home); none play under Reduce Motion */
  choreography?: RobinChoreography;
  testID?: string;
}) {
  const unit = size === undefined ? scale : size / ROBIN_H;
  const { width, height } = size === undefined ? robinSize(scale) : { width: Math.round(size * (ROBIN_W / ROBIN_H)), height: size };
  const ratio = PixelRatio.get();
  const reduced = useReducedMotion();
  const play = usePlay();
  const alive = animated && !reduced && play;
  const chirps = alive && !beakOpen && (mood === "normal" || mood === "happy");

  const paths = useMemo(() => {
    // The art's grid starts at (-1, -1): cell x sits at (x + 1) · scale.
    const of = (layer: RobinLayer) => robinLayer(mood, layer).map(([fill, d]) => [fill, snapPath(d, { unit, dx: unit, dy: unit, ratio })] as const);
    return { body: of("body"), beak: of("beak"), beakOpen: of("beakOpen"), wingUp: of("wingUp"), eye: of("eye"), extra: of("extra") };
  }, [mood, unit, ratio]);

  const a11y = {
    accessible: !!title,
    accessibilityRole: title ? ("image" as const) : undefined,
    accessibilityLabel: title,
    accessibilityElementsHidden: !title,
    importantForAccessibility: title ? ("yes" as const) : ("no-hide-descendants" as const),
  };

  let drawing: ReactNode;
  if (!alive) {
    const layers: (keyof typeof paths)[] = ["body", beakOpen ? "beakOpen" : "beak", ...(wingUp ? (["wingUp"] as const) : []), "eye", "extra"];
    drawing = (
      <Svg testID={testID} width={width} height={height} {...a11y}>
        {layers.map((layer) => (
          <G key={layer}>
            {paths[layer].map(([fill, d]) => (
              <Path key={fill} d={d} fill={fill} />
            ))}
          </G>
        ))}
      </Svg>
    );
  } else {
    const eye = eyeCentre(mood, unit);
    const box = { width, height };
    const c = choreography ?? {};
    const loop = (kf: Keyframes, ms: number, more: Partial<LayerMotion> = {}): LayerMotion => ({ kf, ms, loop: true, ...more });
    const once = (f: RobinFlourish): LayerMotion => ({ kf: f.kf, ms: f.ms, delay: f.delay, easing: f.easing });
    const beakMotions = [...(chirps ? [loop(ROBIN_BEAK, chirpMs)] : []), ...(c.beak ? [once(c.beak)] : [])];
    drawing = (
      <View testID={testID} style={box} {...a11y}>
        <Layer {...box} paths={paths.body} />
        <Layer {...box} paths={beakOpen ? paths.beakOpen : paths.beak} motions={beakMotions} />
        {chirps ? <Layer {...box} paths={paths.beakOpen} motions={[loop(ROBIN_BEAK_OPEN, chirpMs)]} hidden /> : null}
        {c.beakOpen ? <Layer {...box} paths={paths.beakOpen} motions={[once(c.beakOpen)]} hidden /> : null}
        {wingUp ? <Layer {...box} paths={paths.wingUp} /> : null}
        {(c.wingUp ?? []).map((f, i) => (
          <Layer key={i} {...box} paths={paths.wingUp} motions={[once(f)]} hidden />
        ))}
        {c.wingStyle ? <Layer {...box} paths={paths.wingUp} style={c.wingStyle} /> : null}
        <Layer
          {...box}
          paths={paths.eye}
          motions={mood === "sleepy" ? [] : [loop(ROBIN_BLINK, MOTION.robinBlinkMs, { easing: "linear", origin: `${eye.x}px ${eye.y}px` })]}
        />
        <Layer
          {...box}
          paths={paths.extra}
          motions={chirps ? [loop(ROBIN_CHIRP, chirpMs)] : mood === "curious" || mood === "sleepy" ? [loop(ROBIN_FLICKER, MOTION.robinFlickerMs)] : []}
        />
        {c.extra ? <Layer {...box} paths={paths.extra} motions={[once(c.extra)]} hidden /> : null}
      </View>
    );
  }

  return hopOnTap ? <Hop enabled={alive}>{drawing}</Hop> : drawing;
}

type LayerMotion = { kf: Keyframes; ms: number; delay?: number; easing?: unknown; loop?: boolean; origin?: string };

/**
 * One layer of her art in its own full-size drawing, under its moves: each move is its own view, outermost first, so a
 * one-off plays inside a loop as the web's nested groups do. Hold-steps timing (steps(1, end)) unless a move says.
 */
function Layer({
  width,
  height,
  paths,
  motions = [],
  hidden = false,
  style,
}: {
  width: number;
  height: number;
  paths: readonly (readonly [string, string])[];
  motions?: LayerMotion[];
  /** at rest this layer shows only mid-motion (an open beak, a raised wing) */
  hidden?: boolean;
  /** a caller's UI-thread animated style (the hop wing) */
  style?: StyleProp<ViewStyle>;
}) {
  if (paths.length === 0) return null;
  let node: ReactNode = (
    <Svg width={width} height={height}>
      {paths.map(([fill, d]) => (
        <Path key={fill} d={d} fill={fill} />
      ))}
    </Svg>
  );
  for (let i = motions.length - 1; i >= 0; i--) {
    node = (
      <Moving motion={motions[i]!} width={width} height={height} hidden={hidden && i === 0}>
        {node}
      </Moving>
    );
  }
  if (motions.length > 0 && !style) return node;
  return (
    <Animated.View
      testID="robin-layer"
      pointerEvents="none"
      style={[{ position: "absolute", left: 0, top: 0, width, height, opacity: hidden && motions.length === 0 ? 0 : 1 }, style]}
    >
      {node}
    </Animated.View>
  );
}

function Moving({ motion, width, height, hidden, children }: { motion: LayerMotion; width: number; height: number; hidden: boolean; children: ReactNode }) {
  const style = useKeyframes(motion.kf, {
    duration: motion.ms,
    delay: motion.delay,
    easing: motion.easing ?? STEP1,
    iterations: motion.loop ? "infinite" : 1,
    fill: motion.loop ? "none" : "backwards",
  });
  return (
    <Animated.View
      testID="robin-layer"
      pointerEvents="none"
      style={[{ position: "absolute", left: 0, top: 0, width, height, opacity: hidden ? 0 : 1 }, motion.origin ? { transformOrigin: motion.origin } : null, style]}
    >
      {children}
    </Animated.View>
  );
}

/** The centre of her eye's cells in px (the web's `transform-box: fill-box; transform-origin: center`). */
export function eyeCentre(mood: RobinMood, unit: number): { x: number; y: number } {
  const runs = ROBIN_ART[mood].eye;
  if (runs.length === 0) return { x: 0, y: 0 };
  const x0 = Math.min(...runs.map((r) => r.x));
  const x1 = Math.max(...runs.map((r) => r.x + r.w));
  const y0 = Math.min(...runs.map((r) => r.y));
  const y1 = Math.max(...runs.map((r) => r.y + 1));
  // +1 cell: the art's grid starts at (-1, -1)
  return { x: ((x0 + x1) / 2 + 1) * unit, y: ((y0 + y1) / 2 + 1) * unit };
}

/** A tap hops her 4px (web `.robin-hop:hover`, 360ms, steps(4, end)); each tap replays it. */
function Hop({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [hops, setHops] = useState(0);
  return (
    <Pressable testID="robin-hop" accessible={false} onPress={() => setHops((n) => n + 1)} disabled={!enabled}>
      {hops > 0 ? <HopOnce key={hops}>{children}</HopOnce> : children}
    </Pressable>
  );
}

function HopOnce({ children }: { children: ReactNode }) {
  const style = useKeyframes(ROBIN_HOP, { duration: MOTION.robinHopMs, easing: STEPS4, fill: "none" });
  return <Animated.View style={style}>{children}</Animated.View>;
}

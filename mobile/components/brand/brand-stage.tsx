import { useState, type ReactNode } from "react";
import { Text as RNText, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { steps, useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { COLOR, ROBIN_FEET_X, ROLE, TYPE } from "../../lib/brand/shared";
import { robinSize } from "../../lib/brand/robin-paths";
import { textStyle } from "../../lib/brand/type";
import { useKeyframes, type AnimationOptions, type Keyframes } from "../motion/keyframes";
import { Robin } from "./robin";
import {
  RULE_GROW,
  SAVING_MS,
  SAVING_RISE,
  STAGE_HOP,
  STAGE_MS,
  STAGE_SHADOW,
  STAGE_TURN,
  STAGE_WANDER,
  STEP1,
  STEPS2,
  STEPS3,
  TICKER_MS,
  WM_IN,
  WM_WAVE,
  tickerCaret,
  tickerType,
} from "./robin-keyframes";
import { Text } from "./text";

/**
 * The sign-in brand moment (the web's src/app/(auth)/brand-stage.tsx), on its one 8s beat (globals.css `stage-*`,
 * `saving`, `wm-*`, `rule-grow`, `ticker-*`): Crystal hops two cells right, chirps, turns, hops two cells left of centre,
 * turns back, chirps and hops home, never more than 8px from the middle, her shadow shrinking under each hop; a "+$"
 * saving rises from each chirp; the wordmark steps in, then ripples as she lands; five savings lines type and erase in
 * turn. All Reanimated keyframes on the views, 4px sprite steps. Under Reduce Motion it holds still: Crystal on her
 * shadow, the wordmark, TRACK : PLAN : GROW, the red rule and the first line, exactly the web's motion-off frame.
 */

const SCALE = 4; // 88px tall, as on the web
const { width: ROBIN_WIDTH } = robinSize(SCALE);
const FEET = ROBIN_FEET_X * ROBIN_WIDTH;
const SHADOW = { width: 56, height: 8 };

/** `.pixel-corners`: a rectangle with 2px-stepped corners (globals.css), as a path. */
export function pixelCornersPath(w: number, h: number): string {
  return [
    `M0 4H2V2H4V0H${w - 4}V2H${w - 2}V4H${w}`,
    `V${h - 4}H${w - 2}V${h - 2}H${w - 4}V${h}`,
    `H4V${h - 2}H2V${h - 4}H0Z`,
  ].join("");
}

// Each rises from the beak as she chirps: 1.6s into the beat (standing right of centre) and 5.6s (standing left); four
// take two beats to repeat. `x` is the web's `79% ± 8px` of the stage.
const SAVINGS = [
  { text: "+$20", at: 1600, dx: 8 },
  { text: "+$5", at: 5600, dx: -8 },
  { text: "+$12", at: 9600, dx: 8 },
  { text: "+$50", at: 13600, dx: -8 },
];

// One 4s slot each; the ticker keyframes are written for exactly five.
export const TICKER_LINES = [
  "Every dollar has a job.",
  "Small savings add up.",
  "Pay yourself first.",
  "Future you says thanks.",
  "Watch your savings grow.",
];
/** Geist Mono is exactly 1ch per glyph: 0.6em, 7.8px at 13px */
const CH = 0.6 * TYPE.mono.size;
const CARET = 0.5 * TYPE.mono.size;

const WORDMARK = "Budgts";
const STEPS5 = steps(5, "jump-end");

function Anim({ kf, o, style, children, testID }: { kf: Keyframes; o: AnimationOptions; style?: StyleProp<ViewStyle>; children?: ReactNode; testID?: string }) {
  const motion = useKeyframes(kf, o);
  return (
    <Animated.View testID={testID} style={[style, motion]}>
      {children}
    </Animated.View>
  );
}

const beat = (easing: unknown): AnimationOptions => ({ duration: STAGE_MS, easing, iterations: "infinite", fill: "none" });

export function BrandStage() {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ paddingTop: 40, width: ROBIN_WIDTH }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SAVINGS.map((s) => (
          <Saving key={s.text} {...s} />
        ))}
        <Anim testID="stage-wander" kf={STAGE_WANDER} o={beat(STEPS2)}>
          <Anim kf={STAGE_HOP} o={beat(STEPS2)} style={{ flexDirection: "row" }}>
            {/* she pivots on her feet, where her shadow is centred, so it stays under her facing left */}
            <Anim testID="stage-turn" kf={STAGE_TURN} o={beat(STEP1)} style={{ flexDirection: "row", transformOrigin: `${FEET}px 50%` }}>
              <Robin mood="happy" scale={SCALE} />
            </Anim>
          </Anim>
          <Anim kf={STAGE_SHADOW} o={beat(STEPS2)} style={{ marginTop: 4, marginLeft: FEET - SHADOW.width / 2, width: SHADOW.width, height: SHADOW.height }}>
            <Svg width={SHADOW.width} height={SHADOW.height}>
              <Path d={pixelCornersPath(SHADOW.width, SHADOW.height)} fill={ROLE.track} />
            </Svg>
          </Anim>
        </Anim>
      </View>

      <View style={{ marginTop: 24, flexDirection: "row" }} accessible accessibilityRole="text" accessibilityLabel={WORDMARK}>
        {WORDMARK.split("").map((ch, i) => (
          <Anim key={i} kf={WM_IN} o={{ duration: 360, delay: i * 70 + 200, easing: STEPS3 }}>
            <Anim kf={WM_WAVE} o={{ duration: STAGE_MS, delay: i * 60, easing: STEP1, iterations: "infinite", fill: "none" }}>
              <Text testID="wordmark-letter" variant="pxFigureLg" style={{ lineHeight: TYPE.pxFigureLg.size }}>
                {ch}
              </Text>
            </Anim>
          </Anim>
        ))}
      </View>
      {/* `.font-pixel`: Dogica Pixel with 0.06em tracking, no word trim */}
      <Text
        variant="pxTag"
        color={ROLE.muted}
        style={{ marginTop: 16, letterSpacing: 0.06 * TYPE.pxTag.size }}
        accessibilityLabel="Track, plan, grow"
      >
        {"Track "}
        <Text variant="pxTag" color={COLOR.signal} style={{ letterSpacing: 0.06 * TYPE.pxTag.size }}>
          :
        </Text>
        {" Plan "}
        <Text variant="pxTag" color={COLOR.signal} style={{ letterSpacing: 0.06 * TYPE.pxTag.size }}>
          :
        </Text>
        {" Grow"}
      </Text>
      <Anim testID="stage-rule" kf={RULE_GROW} o={{ duration: 480, delay: 700, easing: STEPS5 }} style={{ marginTop: 20, width: 40, height: 1, backgroundColor: ROLE.accent }} />
      <Ticker />
    </View>
  );
}

/** A "+$" saving (web `.saving`): hidden at rest, it rises from her beak on each chirp. */
function Saving({ text, at, dx }: { text: string; at: number; dx: number }) {
  const [w, setW] = useState<number | null>(null);
  return (
    <Anim
      kf={SAVING_RISE}
      o={{ duration: SAVING_MS, delay: at, iterations: "infinite", fill: "none" }}
      // centred on 79% of the stage (± 8px), as the web's translate(-50%) centres it
      style={{ position: "absolute", top: 20, left: 0.79 * ROBIN_WIDTH + dx - (w ?? 0) / 2, opacity: 0 }}
    >
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
        {w ? (
          <Svg width={w} height={16} style={{ position: "absolute", left: 0, top: 0 }}>
            <Path d={pixelCornersPath(w, 16)} fill={ROLE.pos} />
          </Svg>
        ) : null}
        <RNText style={[textStyle("pxTagBold"), { letterSpacing: 0, lineHeight: 8, textTransform: "none", color: COLOR.white }]}>{text}</RNText>
      </View>
    </Anim>
  );
}

/**
 * The savings ticker (web `.ticker-line`): each line types one Geist Mono character per step, holds, erases, in its 4s
 * slot of a 20s cycle, a red caret at its edge, after a 0.8s beat for the screen to settle. Each line is centred as a
 * whole, so it types from a fixed start. At rest only the first line shows.
 */
function Ticker() {
  const reduced = useReducedMotion();
  return (
    <View style={{ marginTop: 20, height: 20, alignSelf: "stretch" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {reduced ? <TickerText line={TICKER_LINES[0]!} /> : TICKER_LINES.map((line, k) => <TickerLine key={line} line={line} k={k} />)}
    </View>
  );
}

function TickerText({ line }: { line: string }) {
  return (
    <RNText testID="ticker-line" numberOfLines={1} style={[textStyle("mono"), { position: "absolute", top: 0, left: "50%", marginLeft: (-line.length * CH) / 2, width: line.length * CH, color: ROLE.muted }]}>
      {line}
    </RNText>
  );
}

function TickerLine({ line, k }: { line: string; k: number }) {
  const width = line.length * CH;
  const type = useKeyframes(tickerType(width, CARET), {
    duration: TICKER_MS,
    delay: k * 4000 + 800,
    easing: steps(line.length, "jump-end"),
    iterations: "infinite",
    fill: "none",
  });
  const caret = useKeyframes(tickerCaret(ROLE.accent), { duration: 900, easing: STEP1, iterations: "infinite", fill: "none" });
  // the typed characters, then the caret at their edge (the web's right border), the whole box growing as she types
  return (
    <Animated.View
      testID="ticker-type"
      style={[{ position: "absolute", top: 0, left: "50%", marginLeft: -width / 2, height: 20, width: CARET, opacity: 0, overflow: "hidden", flexDirection: "row" }, type]}
    >
      <View style={{ flexShrink: 1, minWidth: 0, overflow: "hidden" }}>
        <RNText testID="ticker-line" numberOfLines={1} style={[textStyle("mono"), { width, color: ROLE.muted }]}>
          {line}
        </RNText>
      </View>
      <Animated.View testID="ticker-caret" style={[{ width: CARET, height: 20, flexShrink: 0, backgroundColor: ROLE.accent }, caret]} />
    </Animated.View>
  );
}

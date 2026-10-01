import { useMemo, useRef } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { ROLE, type TypeRoleName } from "../../lib/brand/shared";
import { isPixelRole, textStyle } from "../../lib/brand/type";
import { formatMoney } from "../../lib/shared";
import { EASE_OUT, ROLL_GLIDE_MS, ROLL_IN_MS, rollDelayMs } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { Text } from "../brand/text";
import { usePlay } from "./reveal";

/** One column's reel: 0–9 twice, one per line, so the low digits can spin a full lap before they land. */
const REEL = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n0\n1\n2\n3\n4\n5\n6\n7\n8\n9";
/** Digits counted from the right that spin a lap (ones and cents). */
const LAP_PLACES = 3;

const isDigit = (ch: string) => ch >= "0" && ch <= "9";

/** Where a digit's reel rests: its value, a lap further on for the low places (web `.roll-reel`). */
export const reelOffset = (v: number, lap: boolean, lineHeight: number) => -(v + (lap ? 10 : 0)) * lineHeight;

/**
 * The window a reel shows through (web `.roll-col` clip-path): Geist digits
 * are a 0.88em band centred in the line, so a rolling reel shows no stray
 * fragments above or below the figure; Dogica figures use the line box.
 */
export function reelWindow(variant: TypeRoleName, lineHeightOverride?: number): { top: number; height: number } {
  const { fontSize } = textStyle(variant);
  const lineHeight = lineHeightOverride ?? textStyle(variant).lineHeight;
  if (isPixelRole(variant)) return { top: 0, height: lineHeight };
  const height = 0.88 * fontSize;
  return { top: (lineHeight - height) / 2, height };
}

/** A figure's own line height and tracking over its role's, or nothing. */
function textOverride(lineHeight?: number, letterSpacing?: number): { lineHeight?: number; letterSpacing?: number } | null {
  if (!lineHeight && letterSpacing === undefined) return null;
  return { ...(lineHeight ? { lineHeight } : {}), ...(letterSpacing !== undefined ? { letterSpacing } : {}) };
}

function Reel({
  ch,
  place,
  column,
  variant,
  lineHeightOverride,
  letterSpacing,
  color,
  play,
}: {
  ch: string;
  place: number;
  column: number;
  variant: TypeRoleName;
  lineHeightOverride?: number;
  letterSpacing?: number;
  color: string;
  play: boolean;
}) {
  const { fontSize } = textStyle(variant);
  const lineHeight = lineHeightOverride ?? textStyle(variant).lineHeight;
  const lh = textOverride(lineHeightOverride, letterSpacing);
  const win = reelWindow(variant, lineHeightOverride);
  const rest = reelOffset(Number(ch), place < LAP_PLACES, lineHeight);
  // The spin-in plays once, from the first value; later values glide (a transition), like the web's reels.
  const first = useRef(rest).current;
  const spin = useMemo(() => ({ from: { transform: [{ translateY: 0 }] }, to: { transform: [{ translateY: first }] } }), [first]);
  const bleed = 0.2 * fontSize;
  const timing = useMotionTiming(rollDelayMs(column));
  return (
    <View>
      <Text variant={variant} color={color} style={[{ opacity: 0, fontVariant: ["tabular-nums"] }, lh]}>
        {ch}
      </Text>
      <View style={{ position: "absolute", left: -bleed, right: -bleed, top: win.top, height: win.height, overflow: "hidden" }}>
        <Animated.View
          style={[
            { position: "absolute", left: bleed, right: bleed, top: -win.top, transform: [{ translateY: rest }] },
            { transitionProperty: "transform", transitionDuration: `${ROLL_GLIDE_MS}ms`, transitionTimingFunction: EASE_OUT },
            play
              ? {
                  animationName: spin,
                  animationDuration: `${ROLL_IN_MS}ms`,
                  ...timing,
                  animationTimingFunction: EASE_OUT,
                  animationFillMode: "backwards" as const,
                }
              : null,
          ]}
        >
          <Text variant={variant} color={color} style={[{ textAlign: "center", fontVariant: ["tabular-nums"] }, lh]}>
            {REEL}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * A money figure whose digits roll into place like an odometer, then glide to
 * each new value (web src/components/rolling-amount.tsx). The resting frame is
 * the final figure, which is what shows with motion off; a screen reader
 * reads the plain formatted amount. Each digit column keeps its key (its
 * place from the right), so a new value rolls each reel instead of remounting.
 */
export function RollingAmount({
  value,
  currency,
  variant = "tNumXl",
  color = ROLE.ink,
  lineHeight,
  letterSpacing,
  testID = "rolling-amount",
}: {
  value: number;
  currency: string;
  variant?: TypeRoleName;
  /** a figure set tighter than its role (the ring's 15/20 total) */
  lineHeight?: number;
  /** a figure tracked other than its role (the welcome guide's Money Left: the web's `.tnum` −0.01em outranks the size's) */
  letterSpacing?: number;
  color?: string;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const play = usePlay() && !reduced;
  const text = formatMoney(value, currency);
  const chars = [...text];
  const lh = textOverride(lineHeight, letterSpacing);

  if (reduced) {
    return (
      <Text testID={testID} variant={variant} color={color} style={[{ fontVariant: ["tabular-nums"] }, lh]}>
        {text}
      </Text>
    );
  }

  const digitCount = chars.filter(isDigit).length;
  let seen = 0;
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={text} style={{ flexDirection: "row", alignItems: "flex-start" }}>
      {chars.map((ch, i) => {
        const key = chars.length - 1 - i;
        if (!isDigit(ch)) {
          return (
            <Text key={`s${key}`} variant={variant} color={color} style={lh}>
              {ch}
            </Text>
          );
        }
        const place = digitCount - 1 - seen;
        seen += 1;
        return <Reel key={`d${key}`} ch={ch} place={place} column={seen} variant={variant} lineHeightOverride={lineHeight} letterSpacing={letterSpacing} color={color} play={play} />;
      })}
    </View>
  );
}

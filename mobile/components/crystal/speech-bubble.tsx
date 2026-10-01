import { View } from "react-native";
import Animated from "react-native-reanimated";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { BIRD, SAY } from "./keyframes";

/** A longer line wraps at 136px on a phone, so it never runs off screen. */
export const BUBBLE_MAX = 136;

/** The line's room inside the bubble: 136px less the ink badge's 4px frame and 8px padding, each side. */
export const BUBBLE_TEXT_MAX = BUBBLE_MAX - 2 * 4 - 2 * 8;

/** Dogica is monospaced: 8px a glyph at the tag size, plus the tag's 1px tracking; a space 2px narrower (word-spacing -0.25em). */
export function tagWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch === " " ? 7 : 9;
  return w;
}

/** Greedy wrap at `width`: as many words per line as fit (a word longer than the line gets a line of its own). */
function wrapAt(words: string[], width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && tagWidth(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Her line as the web's `text-wrap: balance` sets it, the same on Android and iOS, decided before layout so the bubble
 * never draws once and then re-wraps: as few lines as the bubble allows, then the narrowest width that still takes that
 * many lines, so the lines come out as even as they can.
 */
export function bubbleText(text: string, max = BUBBLE_TEXT_MAX): string {
  const words = text.split(" ");
  const count = wrapAt(words, max).length;
  if (count <= 1) return text;
  let width = max;
  while (width > 0 && wrapAt(words, width - 1).length === count) width -= 1;
  return wrapAt(words, width).join("\n");
}

/** The tail: a two-cell step pointing at her (web `.crystal-tail`, a 4×6 stepped polygon). */
function Tail({ side }: { side: "left" | "right" }) {
  // a bubble on her left points right: a full 2×6 column at its edge, then a 2×2 cell beyond it
  const outer = side === "left" ? { right: -4 } : { left: -4 };
  return (
    <View pointerEvents="none" style={[{ position: "absolute", top: "50%", marginTop: -3, width: 4, height: 6 }, outer]}>
      <View style={{ position: "absolute", top: 0, width: 2, height: 6, backgroundColor: ROLE.ink, [side === "left" ? "left" : "right"]: 0 }} />
      <View style={{ position: "absolute", top: 2, width: 2, height: 2, backgroundColor: ROLE.ink, [side === "left" ? "right" : "left"]: 0 }} />
    </View>
  );
}

/**
 * Crystal's speech bubble (web `Bubble`): an ink badge with her line in white
 * pixel caps, 6px down beside her, its tail pointing at her, opening toward
 * the middle of the card. It pops from its tail `atMs` in, holds, and pops
 * away after `forMs` (`crystal-say`); `still` shows it at rest (motion off:
 * the month's note stays).
 */
export function SpeechBubble({
  text,
  side,
  atMs,
  forMs,
  still = false,
  testID,
}: {
  text: string;
  side: "left" | "right";
  atMs: number;
  forMs: number;
  still?: boolean;
  testID?: string;
}) {
  const timing = useMotionTiming(atMs);
  const lines = bubbleText(text);
  const place = side === "left" ? { right: BIRD.width + 8 } : { left: BIRD.width + 8 };
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        // a fixed box the badge sits in against her side, so the badge sizes to its line (the web's w-max, max 136px)
        {
          position: "absolute",
          top: 6,
          zIndex: 1,
          width: BUBBLE_MAX,
          alignItems: side === "left" ? "flex-end" : "flex-start",
          transformOrigin: side === "left" ? "100% 50%" : "0% 50%",
        },
        place,
        still
          ? null
          : {
              // after its moment, a bubble has said its piece
              opacity: 0,
              animationName: SAY,
              animationDuration: `${forMs}ms`,
              animationFillMode: "backwards",
              ...timing,
            },
      ]}
    >
      <View>
        <PixelFrame
          testID={testID ? `${testID}-badge` : undefined}
          frame="px-badge-ink"
          // the web sizes the box to the unwrapped line, so a line that wraps draws the bubble's full 136px
          style={[{ paddingHorizontal: 8, paddingVertical: 3 }, lines.includes("\n") ? { width: BUBBLE_MAX } : null]}
        >
          <Text variant="pxTagBold" color={COLOR.white} style={{ lineHeight: 12 }}>
            {lines}
          </Text>
        </PixelFrame>
        <Tail side={side} />
      </View>
    </Animated.View>
  );
}

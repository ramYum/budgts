import { useMemo, useState, type ReactNode } from "react";
import { PixelRatio, Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLOR, MOTION, ROLE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { DOT, dotsPath } from "../kit/empty-state";

/** The scene stage's height inside its frame (web `h-[236px]`). */
export const SCENE_HEIGHT = 236;

/** The card column's widest (web `max-w-sm`). */
export const CARD_MAX_WIDTH = 384;

/**
 * One card of the welcome guide (web src/components/tour/tour-card.tsx): back / progress / skip, the scene on its dotted
 * stage, Crystal's name tag, the heading, her words, then the step's own form or actions. This is the resting frame, what
 * the web shows with motion off; the entrance (from the direction of travel, heading word by word) is Task A4.
 */
export function TourCard({
  heading,
  body,
  scene,
  media,
  dotCount,
  dotIndex,
  primary,
  secondary,
  onBack,
  onSkip,
  footnote,
}: {
  heading: string;
  body: string;
  /** the step's vignette (scenes.tsx): decorative, hidden from screen readers like the web's aria-hidden */
  scene: ReactNode;
  /** below the words: the currency form, the connect-bank button */
  media?: ReactNode;
  dotCount: number;
  dotIndex: number;
  primary?: ReactNode;
  secondary?: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  footnote?: ReactNode;
}) {
  return (
    <View testID="tour-card" style={{ width: "100%", maxWidth: CARD_MAX_WIDTH, gap: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          {onBack ? <QuietButton testID="tour-back" label="Back" icon="chevron-left" onPress={onBack} style={{ marginLeft: -8 }} /> : null}
        </View>
        <Progress count={dotCount} index={dotIndex} />
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          {onSkip ? <QuietButton testID="tour-skip" label="Skip" onPress={onSkip} style={{ marginRight: -8 }} /> : null}
        </View>
      </View>

      <SceneCard>{scene}</SceneCard>

      <View style={{ alignItems: "center", gap: 12 }}>
        <View testID="tour-name" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Robin size={14} />
          {/* `font-pixel-bold text-[8px]`: Dogica Bold with no tracking and its own spaces */}
          <Text variant="pxTagBold" color={ROLE.ink} style={{ letterSpacing: 0, textTransform: "none" }}>
            CRYSTAL
          </Text>
        </View>
        <Text
          testID="tour-heading"
          variant="heading"
          color={ROLE.heading}
          accessibilityRole="header"
          style={{ fontSize: 26, lineHeight: 29.9, letterSpacing: -0.65, textAlign: "center" }}
        >
          {heading}
        </Text>
        {/* 15px, leading-relaxed, at most 34ch of Geist (a "0" is 0.663em) */}
        <Text testID="tour-body" variant="body" color={ROLE.muted} style={{ lineHeight: 24.375, textAlign: "center", maxWidth: 338 }}>
          {body}
        </Text>
      </View>

      {media ? <View testID="tour-media">{media}</View> : null}

      {primary || secondary ? (
        <View style={{ alignItems: "center", gap: 12 }}>
          {primary ? <View style={{ alignSelf: "stretch" }}>{primary}</View> : null}
          {secondary}
        </View>
      ) : null}

      {footnote ? (
        <View testID="tour-footnote" style={{ alignItems: "center" }}>
          {footnote}
        </View>
      ) : null}
    </View>
  );
}

/** Back / Skip (web `press inline-flex min-h-9 items-center gap-1 px-2 text-[13px] font-medium text-muted`). */
function QuietButton({
  testID,
  label,
  icon,
  onPress,
  style,
}: {
  testID: string;
  label: string;
  icon?: "chevron-left";
  onPress: () => void;
  style?: { marginLeft?: number; marginRight?: number };
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // 36px tall like the web's min-h-9, a 44px touch target
      hitSlop={4}
      style={({ pressed }) => [
        { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
        style,
        { transform: pressed ? [{ scale: MOTION.pressScale }] : [] },
      ]}
    >
      {({ pressed }) => (
        <>
          {icon ? <Icon name={icon} size={12} color={pressed ? ROLE.ink : ROLE.muted} /> : null}
          <Text variant="metaStrong" color={pressed ? ROLE.ink : ROLE.muted}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Where you are in the guide, as 8px square cells 3px apart: done in ink, now in red, the rest on the track. */
export function Progress({ count, index }: { count: number; index: number }) {
  return (
    <View
      testID="tour-progress"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Welcome guide progress"
      accessibilityValue={{ min: 1, max: count, now: index + 1, text: `Step ${index + 1} of ${count}` }}
      style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          testID="tour-progress-cell"
          style={{ width: 8, height: 8, backgroundColor: i < index ? ROLE.ink : i === index ? COLOR.signal : ROLE.track }}
        />
      ))}
    </View>
  );
}

/** The scene's stage: the lead card's raised frame around a 236px field of 2px dots (web `px-card-raised` > `px-dots`). */
function SceneCard({ children }: { children: ReactNode }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ratio = PixelRatio.get();
  const d = useMemo(() => (size ? dotsPath(size.width, size.height, ratio) : ""), [size, ratio]);
  function measure(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }
  return (
    <PixelFrame testID="tour-scene" frame="px-card-raised" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View onLayout={measure} style={{ height: SCENE_HEIGHT, overflow: "hidden" }}>
        {d ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <Svg width="100%" height="100%">
              <Path d={d} fill={DOT.color} />
            </Svg>
          </View>
        ) : null}
        {children}
      </View>
    </PixelFrame>
  );
}

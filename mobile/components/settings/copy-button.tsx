import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, View } from "react-native";
import Animated, { steps } from "react-native-reanimated";
import { useReducedMotion } from "../motion/reduced-motion";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { POP_IN, POP_MS } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { Icon } from "../brand/icon";
import { Badge } from "../kit/tiles";
import { pressStyle } from "../kit/press";

/**
 * Copies a value, then says so (web `CopyButton`): a green "Copied" chip pops
 * in beside the 40px button for two seconds, since a copy is otherwise
 * invisible. A copy the OS refuses confirms nothing.
 */
export function CopyButton({
  value,
  label,
  copy,
  testID = "copy-button",
}: {
  value: string;
  label: string;
  copy: (value: string) => Promise<unknown>;
  testID?: string;
}) {
  const [copied, setCopied] = useState(false);
  const reduced = useReducedMotion();
  const timing = useMotionTiming(0);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function onPress() {
    try {
      await copy(value);
      setCopied(true);
      // TalkBack reads the chip's live region; VoiceOver ignores live regions, so iOS announces it
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility("Copied");
    } catch {
      // the clipboard refused: nothing to confirm
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <View accessibilityLiveRegion="polite">
        {copied ? (
          <Animated.View
            style={
              reduced
                ? null
                : {
                    animationName: POP_IN,
                    animationDuration: `${POP_MS}ms`,
                    animationTimingFunction: steps(3, "jump-end"),
                    animationFillMode: "backwards",
                    ...timing,
                  }
            }
          >
            <Badge tone="growth" icon="check" testID={`${testID}-copied`}>
              Copied
            </Badge>
          </Animated.View>
        ) : null}
      </View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => void onPress()}
        hitSlop={2}
        style={({ pressed }) => [{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}
      >
        {({ pressed }) => <Icon name="copy" color={pressed ? COLOR.graphite : ROLE.ink} />}
      </Pressable>
    </View>
  );
}

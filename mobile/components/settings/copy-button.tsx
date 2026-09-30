import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { steps, useReducedMotion } from "react-native-reanimated";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { Icon } from "../brand/icon";
import { Badge } from "../kit/tiles";
import { pressStyle } from "../kit/press";

/** `@keyframes pop-in` (globals.css): the "Copied" chip steps in from 40%. */
const POP_IN = { from: { opacity: 0, transform: [{ scale: 0.4 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };

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
    } catch {
      // the clipboard refused: nothing to confirm
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <View accessibilityLiveRegion="polite">
        {copied ? (
          <Animated.View
            testID={`${testID}-copied`}
            style={
              reduced
                ? null
                : {
                    animationName: POP_IN,
                    animationDuration: "300ms",
                    animationTimingFunction: steps(3, "jump-end"),
                    animationFillMode: "backwards",
                    ...timing,
                  }
            }
          >
            <Badge tone="growth" icon="check">
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

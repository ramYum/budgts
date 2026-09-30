import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "./press";

/** A chip-row toggle (web `SegmentedControl`): the selected chip solid ink, the rest quiet stepped outlines. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <View
      testID="segmented"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`segment-${o.value}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            hitSlop={6}
          >
            {({ pressed }) => (
              <PixelFrame
                frame="px-chip"
                state={on ? "[aria-pressed='true']" : pressed ? ":hover" : ""}
                style={[{ height: 32, paddingHorizontal: 8, justifyContent: "center" }, pressStyle(pressed)]}
              >
                <Text variant={on ? "bodyStrong" : "body"} color={on ? COLOR.white : pressed ? ROLE.ink : COLOR.graphite}>
                  {o.label}
                </Text>
              </PixelFrame>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

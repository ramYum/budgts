import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLOR, ROLE } from "../../lib/brand/shared";

/** The fill a checked box takes: the web's `accent-[var(--signal-ink)]` (a destructive choice) or `accent-[var(--ink)]`. */
export const CHECKBOX_TONE = { accent: COLOR.signalInk, ink: ROLE.ink } as const;
/** Chrome's unchecked edge. */
export const CHECKBOX_EDGE = "#767676";

/**
 * The web's plain `<input type="checkbox" class="h-4 w-4 accent-…">` as Chrome draws it: a 16px white box with a 1px
 * grey edge and 2px corners; checked, it fills with the tone and shows a white tick. The rounded corners are Chrome's
 * own control, not a brand frame, which is why this one component has a radius. A 44px touch target.
 */
export function Checkbox({
  checked,
  onChange,
  tone = "ink",
  accessibilityLabel,
  disabled = false,
  testID,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: keyof typeof CHECKBOX_TONE;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}) {
  const fill = CHECKBOX_TONE[tone];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={14}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 2,
          borderWidth: checked ? 0 : 1,
          borderColor: CHECKBOX_EDGE,
          backgroundColor: checked ? fill : COLOR.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Svg width={16} height={16}>
            <Path d="M4 8.5L6.8 11.2L12 5.2" stroke={COLOR.white} strokeWidth={2} fill="none" strokeLinecap="square" />
          </Svg>
        ) : null}
      </View>
    </Pressable>
  );
}

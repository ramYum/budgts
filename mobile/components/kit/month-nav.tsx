import { Pressable, View } from "react-native";
import { ROLE, type IconName } from "../../lib/brand/shared";
import { formatMonthLabel, shiftMonthKey } from "../../lib/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "./press";

function Step({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}>
      {({ pressed }) => (
        <PixelFrame
          frame="px-step"
          state={pressed ? ":hover" : ""}
          style={[{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}
        >
          <Icon name={icon} color={ROLE.ink} />
        </PixelFrame>
      )}
    </Pressable>
  );
}

/** "September 2026 ‹ ›" (web `MonthNav`). The month key comes from the server; the arrows only step the key. */
export function MonthNav({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <View testID="month-nav" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text testID="month-label" variant="bodyStrong" color={ROLE.ink} numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
        {formatMonthLabel(month)}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Step testID="month-prev" icon="chevron-left" label="Previous month" onPress={() => onChange(shiftMonthKey(month, -1))} />
        <Step testID="month-next" icon="chevron-right" label="Next month" onPress={() => onChange(shiftMonthKey(month, 1))} />
      </View>
    </View>
  );
}

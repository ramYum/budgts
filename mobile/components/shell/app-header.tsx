import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { bellLabel } from "../../lib/status/status-api";
import { Icon } from "../brand/icon";
import { Logo } from "../brand/logo";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "../kit/press";

export const HEADER_HEIGHT = 56;

/** The header bell (web `NeedsCategoryBell`): bank rows Budgts could not categorise; tapping it opens Activity's "Needs a category". */
export function NeedsCategoryBell({ count, onPress }: { count: number; onPress: () => void }) {
  const { label, badge } = bellLabel(count);
  return (
    <Pressable
      testID="needs-category-bell"
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => [{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}
    >
      {({ pressed }) => (
        <>
          <Icon name="bell" color={pressed ? COLOR.graphite : ROLE.ink} />
          {badge ? (
            <PixelFrame
              testID="needs-category-count"
              frame="px-badge-accent"
              style={{ position: "absolute", right: -2, top: -2, height: 18, minWidth: 18, alignItems: "center", justifyContent: "center" }}
            >
              <Text variant="tLabelStrong" color={COLOR.white} style={{ fontSize: 11, lineHeight: 11, fontVariant: ["tabular-nums"] }}>
                {badge}
              </Text>
            </PixelFrame>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The signed-in header on every screen (web dashboard layout, phone): the
 * lockup on the left, the bell on the right, 56px tall, inset 24px, under the
 * status bar. The lockup goes Home; sign out lives in Settings.
 */
export function AppHeader({
  needsCategoryCount,
  onHome,
  onBell,
}: {
  /** null: bank connections are off (or the status has not arrived), so no bell */
  needsCategoryCount: number | null;
  onHome: () => void;
  onBell: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="app-header" style={{ paddingTop: insets.top, backgroundColor: ROLE.bg }}>
      <View style={{ height: HEADER_HEIGHT, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable testID="header-home" accessibilityRole="link" accessibilityLabel="Budgts home" onPress={onHome} style={({ pressed }) => pressStyle(pressed)}>
          <Logo size={22} />
        </Pressable>
        {needsCategoryCount !== null ? <NeedsCategoryBell count={needsCategoryCount} onPress={onBell} /> : null}
      </View>
    </View>
  );
}

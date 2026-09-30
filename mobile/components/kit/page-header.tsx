import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "./press";

/** The square back arrow for screens reached from a hub (web `BackLink`): a 36px `px-step`, a 44px touch target. */
export function BackButton({ onPress, testID = "page-back" }: { onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} hitSlop={4}>
      {({ pressed }) => (
        <PixelFrame
          frame="px-step"
          state={pressed ? ":hover" : ""}
          style={[{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}
        >
          <Icon name="back" />
        </PixelFrame>
      )}
    </Pressable>
  );
}

/**
 * Every screen's header (web `PageHeader`, phone layout): the pixel title (with
 * a back arrow on screens reached from a hub) and the screen's one action on
 * the first row; the month, when there is one, on its own row 16px below.
 */
export function PageHeader({
  title,
  subtitle,
  onBack,
  month,
  action,
  children,
  testID = "page-header",
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  month?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ marginBottom: 20 }}>
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 }}>
            {onBack ? <BackButton onPress={onBack} /> : null}
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text testID={`${testID}-title`} variant="pxTitle" color={ROLE.ink} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="body" color={ROLE.muted} style={{ marginTop: 4, lineHeight: 20 }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {action ? <View>{action}</View> : null}
        </View>
        {month ? <View>{month}</View> : null}
      </View>
      {children}
    </View>
  );
}

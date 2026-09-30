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
}: {
  /** the pixel title; a node for a title with its own motion (Home's word-by-word greeting) */
  title: string | ReactNode;
  /** a quiet line under the title; a node for one with its own motion (Home's greeting line) */
  subtitle?: string | ReactNode;
  onBack?: () => void;
  month?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View testID="page-header" style={{ marginBottom: 20 }}>
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 }}>
            {onBack ? <BackButton onPress={onBack} /> : null}
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              {typeof title === "string" ? (
                <Text testID="page-title" variant="pxTitle" color={ROLE.ink} accessibilityRole="header">
                  {title}
                </Text>
              ) : (
                <View testID="page-title" accessibilityRole="header">
                  {title}
                </View>
              )}
              {typeof subtitle === "string" && subtitle ? (
                <Text testID="page-subtitle" variant="body" color={ROLE.muted} style={{ marginTop: 4, lineHeight: 20 }}>
                  {subtitle}
                </Text>
              ) : subtitle ? (
                <View testID="page-subtitle" style={{ marginTop: 4 }}>
                  {subtitle}
                </View>
              ) : null}
            </View>
          </View>
          {action ? <View testID="page-action">{action}</View> : null}
        </View>
        {month ? <View testID="page-month">{month}</View> : null}
      </View>
      {children}
    </View>
  );
}

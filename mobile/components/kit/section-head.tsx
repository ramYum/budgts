import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { Text } from "../brand/text";
import { pressStyle } from "./press";

/** A section's heading (web `SectionHead`): sentence case, an optional count, and one link on the right. */
export function SectionHead({
  title,
  count,
  action,
  onAction,
  aside,
  testID,
}: {
  title: string;
  count?: number;
  action?: string;
  onAction?: () => void;
  /** anything else on the right (a badge, a quiet note) */
  aside?: ReactNode;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{ minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
    >
      <Text variant="tHead" color={ROLE.ink} accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
        {count !== undefined ? (
          <Text variant="listName" color={ROLE.muted} style={{ fontVariant: ["tabular-nums"] }}>
            {"  " + String(count)}
          </Text>
        ) : null}
      </Text>
      {action && onAction ? (
        <Pressable
          testID={testID ? `${testID}-action` : undefined}
          accessibilityRole="link"
          accessibilityLabel={action}
          onPress={onAction}
          hitSlop={10}
          style={({ pressed }) => [{ marginVertical: -4, flexDirection: "row", alignItems: "center" }, pressStyle(pressed)]}
        >
          {({ pressed }) => (
            <>
              <Text variant="body" color={pressed ? ROLE.ink : ROLE.muted}>
                {action}
              </Text>
              <View style={{ marginRight: -6 }}>
                <Icon name="chevron-right" color={pressed ? ROLE.ink : ROLE.muted} />
              </View>
            </>
          )}
        </Pressable>
      ) : (
        (aside ?? null)
      )}
    </View>
  );
}

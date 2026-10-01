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
  /** the parity id: "section-head" (title "section-title", link "section-link") unless a screen needs this one apart */
  testID?: string;
}) {
  return (
    <View
      testID={testID ?? "section-head"}
      style={{ minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
    >
      {/* the web's `<h2>title<span class="ml-2">count</span></h2>`: the count 8px after the title (a nested Text can't take a margin) */}
      <View
        testID={testID ? `${testID}-title` : "section-title"}
        accessible
        accessibilityRole="header"
        style={{ flexShrink: 1, flexDirection: "row", alignItems: "baseline" }}
      >
        <Text variant="tHead" color={ROLE.ink} style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {count !== undefined ? (
          <Text variant="listName" color={ROLE.muted} style={{ marginLeft: 8, fontVariant: ["tabular-nums"] }}>
            {String(count)}
          </Text>
        ) : null}
      </View>
      {action && onAction ? (
        <Pressable
          testID={testID ? `${testID}-link` : "section-link"}
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

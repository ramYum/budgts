import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { TextButton } from "../brand/controls";

/** A small warn-framed line with the warning icon (web `.px-warn` advisories). */
export function WarnLine({ children, testID, action }: { children: string; testID?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <PixelFrame
      testID={testID}
      frame="px-warn"
      accessibilityRole="alert"
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 8, paddingVertical: 6 }}
    >
      <View style={{ marginVertical: -2 }}>
        <Icon name="warning" color={ROLE.warn} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" color={ROLE.ink} style={{ fontSize: 14, lineHeight: 20 }}>
          {children}
        </Text>
        {action ? <TextButton onPress={action.onPress} color={ROLE.ink}>{action.label}</TextButton> : null}
      </View>
    </PixelFrame>
  );
}

/**
 * The limited-history advisory (web `src/components/plaid/limited-history-banner.tsx`): a bank sent less history than the
 * 90 days Budgts asks for, so earlier dates may be missing rows. Activity only, stays shown, one line per bank.
 */
export function LimitedHistoryBanner({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <View style={{ marginBottom: 24, gap: 8 }}>
      {messages.map((m, i) => (
        <WarnLine key={i} testID="limited-history-banner">
          {m}
        </WarnLine>
      ))}
    </View>
  );
}

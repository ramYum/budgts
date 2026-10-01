import { ROLE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";

/**
 * A refresh that failed while numbers were already on screen (a pull, a save
 * elsewhere, a bank sync landing): the numbers stay, and this says they may
 * be out of date and offers another try, in the status banners' warn card.
 * Never silent, never a blank screen. The web has no such state (its refresh
 * either lands or shows the error page); this is the native equivalent of
 * keeping the page but telling the truth about it.
 */
export function RefreshNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PixelFrame
      testID="home-refresh-notice"
      frame="px-warn"
      accessibilityRole="alert"
      // Refresh is the card's one action: a screen reader reads the card and offers it
      accessible
      accessibilityLabel={`These numbers may be out of date. ${message}`}
      accessibilityActions={[{ name: "activate", label: "Refresh" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "activate") onRetry();
      }}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}
    >
      <Icon name="warning" color={ROLE.warn} />
      <Text variant="body" color={ROLE.ink} style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={ROLE.ink}>
          These numbers may be out of date.
        </Text>
        {` ${message} `}
        <Text
          testID="home-refresh-notice-retry"
          variant="listName"
          color={ROLE.ink}
          accessibilityRole="link"
          onPress={onRetry}
          style={{ textDecorationLine: "underline" }}
        >
          Refresh
        </Text>
        .
      </Text>
    </PixelFrame>
  );
}

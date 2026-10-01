import { View } from "react-native";
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
 * keeping the page but telling the truth about it. Drawn by the shell
 * (`<Screen notice onRetry name>`, `<StandaloneShell …>`), in one place under
 * the banners; ids `<screen>-refresh-notice` and `<screen>-refresh-notice-retry`.
 */
export function RefreshNotice({ message, onRetry, testID }: { message: string; onRetry: () => void; testID: string }) {
  return (
    <PixelFrame
      testID={testID}
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
          testID={`${testID}-retry`}
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

/** A screen's stale-data notice: `useResource`'s `notice`, its retry, and the screen's name for the ids. */
export type StaleNoticeProps =
  | { notice?: undefined; onRetry?: undefined; name?: undefined }
  | { notice: string | null; onRetry: () => void; name: string };

/** The notice where every shell draws it: first in the page, 20px above it. */
export function StaleNotice({ notice, onRetry, name }: StaleNoticeProps) {
  if (!notice || !onRetry) return null;
  return (
    <View style={{ marginBottom: 20 }}>
      <RefreshNotice testID={`${name}-refresh-notice`} message={notice} onRetry={onRetry} />
    </View>
  );
}

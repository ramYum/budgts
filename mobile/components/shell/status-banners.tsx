import { View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { MobileStatus } from "../../lib/status/status-api";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";

function Notice({
  frame,
  iconColor,
  lead,
  leadColor,
  body,
  link,
  onLink,
  testID,
}: {
  frame: "px-wash" | "px-warn";
  iconColor: string;
  lead: string;
  leadColor: string;
  body: string;
  link: string;
  onLink: () => void;
  testID: string;
}) {
  return (
    <PixelFrame testID={testID} frame={frame} accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}>
      <Icon name="warning" color={iconColor} />
      <Text variant="body" color={ROLE.ink} style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={leadColor}>
          {lead}
        </Text>
        {` ${body} `}
        <Text
          variant="listName"
          color={ROLE.ink}
          accessibilityRole="link"
          onPress={onLink}
          style={{ textDecorationLine: "underline" }}
        >
          {link}
        </Text>
        .
      </Text>
    </PixelFrame>
  );
}

/**
 * What the web layout shows above every page (web `DeletionBanner`,
 * `ReviewBanner`): a started deletion makes the account read-only (never let
 * writes fail silently), and a flagged or excluded bank connection qualifies
 * every total. No dismiss control: each state changes only by a deliberate
 * action on its own screen. In the page's column, 12px under the header.
 */
export function StatusBanners({
  status,
  onFinishDeleting,
  onReview,
}: {
  status: MobileStatus | null;
  onFinishDeleting: () => void;
  onReview: () => void;
}) {
  if (!status) return null;
  const { deletionInProgress, review } = status;
  if (!deletionInProgress && !review.excluded && !review.advisory) return null;
  return (
    <View style={{ paddingTop: 12, gap: 12 }}>
      {deletionInProgress ? (
        <Notice
          testID="deletion-banner"
          frame="px-wash"
          iconColor={COLOR.signal}
          lead="Your account is being deleted."
          leadColor={COLOR.signalInk}
          body="It's read-only, so changes won't save."
          link="Finish deleting"
          onLink={onFinishDeleting}
        />
      ) : null}
      {review.excluded ? (
        <Notice
          testID="review-banner-excluded"
          frame="px-wash"
          iconColor={COLOR.signal}
          lead="Excluded from totals."
          leadColor={COLOR.signalInk}
          body={review.excluded}
          link="Review it in Settings"
          onLink={onReview}
        />
      ) : null}
      {review.advisory ? (
        <Notice
          testID="review-banner-advisory"
          frame="px-warn"
          iconColor={ROLE.warn}
          lead="Totals may be inaccurate."
          leadColor={ROLE.ink}
          body={review.advisory}
          link="Review it in Settings"
          onLink={onReview}
        />
      ) : null}
    </View>
  );
}

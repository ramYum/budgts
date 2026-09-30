import { View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { LoadState } from "../../lib/api/load";
import { avatarLetter, signsInWith, type ProfileDetails } from "../../lib/settings/profile-details";
import { Button } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { EmptyState } from "../kit/empty-state";
import { PageHeader } from "../kit/page-header";
import { SectionHead } from "../kit/section-head";
import { Badge } from "../kit/tiles";
import { CopyButton } from "./copy-button";
import { RowsCard } from "./rows-card";

/** A detail's name over its value (web `dt` 13/20 muted, `dd` 15/24 medium ink). */
function Detail({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="meta" color={ROLE.muted}>
        {label}
      </Text>
      <Text testID={testID} variant="listName" color={ROLE.ink} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Body({ d, copy }: { d: ProfileDetails; copy: (value: string) => Promise<unknown> }) {
  return (
    <View style={{ gap: 32 }}>
      <PixelFrame testID="profile-card" frame="px-card-raised" style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 8 }}>
        <PixelFrame
          frame="px-tile-ink"
          style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="pxFigure" color={COLOR.white} style={{ lineHeight: 16 }}>
            {avatarLetter(d)}
          </Text>
        </PixelFrame>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="profile-name" variant="pxFigure" color={ROLE.ink} numberOfLines={1}>
            {d.displayName || "You"}
          </Text>
          <Text variant="body" color={ROLE.muted}>
            Signs in with {signsInWith(d.signInMethods)}
          </Text>
        </View>
      </PixelFrame>

      <View style={{ gap: 12 }}>
        <SectionHead title="Details" />
        <RowsCard pad={12} testID="profile-details">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Detail label="Email" value={d.email} testID="profile-email" />
            <CopyButton value={d.email} label="Copy email" copy={copy} testID="profile-copy-email" />
          </View>
          <Detail label="Currency" value={`${d.currency} · ${d.currencyName}`} testID="profile-currency" />
          {/* an onboarded profile always has a zone; this only guards a half-finished one */}
          <Detail label="Time zone" value={d.timeZoneLabel ?? "Not set yet"} testID="profile-time-zone" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Detail label="Sign-in methods" value={d.signInMethods.join(" · ")} testID="profile-methods" />
            <View>
              <Badge tone="growth" icon="check" testID="profile-methods-count">
                {`${d.signInMethods.length} active`}
              </Badge>
            </View>
          </View>
        </RowsCard>
        <Text variant="meta" color={ROLE.muted}>
          {"Amounts everywhere use your currency. It's set once, when you start, so every amount keeps its meaning."}
        </Text>
        <Text variant="meta" color={ROLE.muted}>
          Your time zone follows your device, so each month starts at your own midnight.
        </Text>
      </View>
    </View>
  );
}

/**
 * Profile (web settings/profile/page.tsx): who you are, how you sign in, and
 * the currency and time zone every amount and month follows. Nothing here is
 * editable, as on the web: the currency is set once, and the zone follows the
 * device.
 */
export function ProfileView({
  state,
  onBack,
  onRetry,
  copy,
}: {
  state: LoadState<ProfileDetails>;
  onBack: () => void;
  onRetry: () => void;
  copy: (value: string) => Promise<unknown>;
}) {
  return (
    <View testID="profile-view">
      <PageHeader title="Profile" onBack={onBack} />
      {state.status === "ready" ? (
        <Body d={state.data} copy={copy} />
      ) : state.status === "error" ? (
        <EmptyState
          testID="profile-error"
          icon="warning"
          title="Couldn't load your profile"
          body={state.message}
          action={
            <Button testID="profile-retry" variant="secondary" icon="sync" onPress={onRetry}>
              Try again
            </Button>
          }
        />
      ) : null}
    </View>
  );
}

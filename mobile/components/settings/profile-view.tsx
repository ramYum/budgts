import { View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { MobileProfile } from "../../lib/profile/profile-api";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { PageHeader } from "../kit/page-header";
import { SectionHead } from "../kit/section-head";
import { Badge } from "../kit/tiles";
import { CopyButton } from "./copy-button";
import { RowsCard } from "./rows-card";

/** The Profile screen's lines, from the shared profile (the server derives them with the web page's own functions). */
export type ProfileDetails = Pick<MobileProfile, "email" | "displayName" | "signInMethods" | "currency" | "currencyName" | "timeZoneLabel">;

/** The web's "Signs in with …" line: "an email link or Google". */
export function signsInWith(methods: readonly string[]): string {
  return methods.map((m) => (m === "Email link" ? "an email link" : m)).join(" or ");
}

/** The avatar's letter: the name's, else the email's, else "?" (web Profile page). */
export function avatarLetter(d: Pick<ProfileDetails, "displayName" | "email">): string {
  return (d.displayName || d.email || "?")[0]!;
}

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
            <Detail label="Email" value={d.email ?? ""} testID="profile-email" />
            <CopyButton value={d.email ?? ""} label="Copy email" copy={copy} testID="profile-copy-email" />
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
  profile,
  onBack,
  copy,
}: {
  profile: ProfileDetails;
  onBack: () => void;
  copy: (value: string) => Promise<unknown>;
}) {
  return (
    <View testID="profile-view">
      <PageHeader title="Profile" onBack={onBack} />
      <Body d={profile} copy={copy} />
    </View>
  );
}

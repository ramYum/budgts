import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { APPLE_MANAGE_URL, DELETION_SUBSCRIPTION_NOTICE, GOOGLE_MANAGE_URL } from "../../lib/account/delete-screen";
import { Button } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { Stage } from "../kit/empty-state";
import { LinkError } from "./link-error";

function Link({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Text variant="listName" color={ROLE.ink} accessibilityRole="link" onPress={onPress} style={{ textDecorationLine: "underline" }}>
      {children}
    </Text>
  );
}

/**
 * Where a completed deletion lands, signed out (web account-deleted/page.tsx):
 * what happened; when a store subscription may still be running, that
 * deleting didn't cancel it, with the stores' own pages; what's kept, only
 * when anything is; Done, to sign-in.
 */
export function AccountDeletedView({
  store,
  keeps,
  privacyUrl,
  openUrl,
  onDone,
  linkError = null,
}: {
  /** the deletion endpoint said a store subscription may still be running */
  store: boolean;
  /** a billing record outlives the account */
  keeps: boolean;
  /** the privacy page's deletion section, while the legal pages are live */
  privacyUrl: string | null;
  openUrl: (url: string) => void;
  onDone: () => void;
  /** a store or privacy page that wouldn't open */
  linkError?: string | null;
}) {
  return (
    <View testID="account-deleted" style={{ gap: 24 }}>
      <Stage>
        <Robin mood="sleepy" scale={4} />
        <View style={{ height: 4, width: 80, backgroundColor: ROLE.hairline }} />
      </Stage>
      <View style={{ gap: 8 }}>
        <Text testID="page-title" variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
          Your account is deleted
        </Text>
        <Text variant="input" color={ROLE.muted}>
          {"Your transactions, budgets, goals and bank connections are gone, and you're signed out everywhere. Thanks for budgeting with us."}
        </Text>
      </View>

      {store ? (
        <PixelFrame testID="account-deleted-store" frame="px-warn" style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}>
          <Icon name="warning" color={ROLE.warn} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="body" color={ROLE.ink}>
              {`${DELETION_SUBSCRIPTION_NOTICE} To stop being charged, cancel it in the `}
              <Link onPress={() => openUrl(APPLE_MANAGE_URL)}>App Store</Link>
              {" or "}
              <Link onPress={() => openUrl(GOOGLE_MANAGE_URL)}>Google Play</Link>.
            </Text>
          </View>
        </PixelFrame>
      ) : null}

      {/* Retention 0 (owner, 2026-09-28): nothing is kept, so there is nothing to say here. */}
      {keeps ? (
        <Text testID="account-deleted-kept" variant="meta" color={ROLE.muted}>
          If you ever paid for a subscription, we keep those billing records without your email or sign-in details.
          {privacyUrl ? (
            <>
              {" "}
              <Text variant="metaStrong" color={ROLE.ink} accessibilityRole="link" onPress={() => openUrl(privacyUrl)} style={{ textDecorationLine: "underline" }}>
                What we keep and why
              </Text>
              .
            </>
          ) : null}
        </Text>
      ) : null}

      <LinkError message={linkError} />

      <Button testID="account-deleted-done" size="lg" onPress={onDone}>
        Done
      </Button>
    </View>
  );
}

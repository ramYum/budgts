import { useEffect, useRef } from "react";
import { View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { ROLE } from "../../lib/brand/shared";
import type { LoadErrorKind } from "../../lib/api/load";
import { Button } from "../brand/controls";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { Stage } from "../kit/empty-state";
import { Badge } from "../kit/tiles";
import { ScreenSkeleton } from "./skeleton";

/**
 * Something failed to load (web src/app/error.tsx): Crystal, curious, on her
 * stage; that the data is safe; Try again, or Home. On a signed-in screen the
 * tab bar stays below it, one more way out.
 */
export function ErrorState({ onRetry, onHome }: { onRetry: () => void; onHome?: () => void }) {
  return (
    <View testID="error-state" accessibilityRole="alert" style={{ gap: 24 }}>
      <Stage>
        <Robin mood="curious" scale={4} />
        <View style={{ height: 4, width: 64, backgroundColor: ROLE.hairline }} />
      </Stage>
      <View style={{ gap: 8 }}>
        <Text variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
          Something went wrong
        </Text>
        <Text variant="input" color={ROLE.muted}>
          We couldn&apos;t load this page. Your data is safe. Try again, or head back home.
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Button testID="error-retry" size="lg" icon="sync" onPress={onRetry}>
          Try again
        </Button>
        {onHome ? (
          <Button variant="secondary" size="lg" icon="home" onPress={onHome}>
            Home
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/**
 * No connection (web src/app/offline/page.tsx): Crystal asleep on her stage,
 * what happened, one way back. It also tries again by itself the moment the
 * connection returns (a NetInfo event, never a timer).
 */
export function OfflineState({ onRetry }: { onRetry: () => void }) {
  const retry = useRef(onRetry);
  useEffect(() => {
    retry.current = onRetry;
  });
  useEffect(() => {
    // Only a change from offline to online retries: the listener's first call reports the current state, and a
    // screen that failed while the device says it's online must not retry in a loop.
    let wasOffline = false;
    return NetInfo.addEventListener((s) => {
      const online = s.isConnected === true && s.isInternetReachable !== false;
      if (!online) wasOffline = true;
      else if (wasOffline) {
        wasOffline = false;
        retry.current();
      }
    });
  }, []);
  return (
    <View testID="offline-state" accessibilityRole="alert" style={{ gap: 24 }}>
      <Stage>
        <Robin mood="sleepy" scale={4} />
        <View style={{ height: 4, width: 80, backgroundColor: ROLE.hairline }} />
      </Stage>
      <View style={{ gap: 8 }}>
        <Badge tone="gray" icon="disconnect">
          No connection
        </Badge>
        <Text variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
          You&apos;re offline
        </Text>
        <Text variant="input" color={ROLE.muted}>
          Budgts needs a connection to load your data. Nothing is lost. Reconnect and it picks up right where you left off.
        </Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button size="lg" icon="sync" onPress={onRetry}>
          Try again
        </Button>
      </View>
    </View>
  );
}

/**
 * A screen's failed load, shown the web's way for its cause: no connection →
 * the offline screen; an expired session → back to sign in (the web
 * redirects to /sign-in), with the loading shape meanwhile; anything else →
 * the error screen. Every branch has a way out.
 */
export function LoadFailure({
  kind,
  onRetry,
  onHome,
  onSignOut,
}: {
  kind: LoadErrorKind;
  onRetry: () => void;
  onHome?: () => void;
  onSignOut: () => void;
}) {
  const signedOut = useRef(false);
  useEffect(() => {
    if (kind === "auth" && !signedOut.current) {
      signedOut.current = true;
      onSignOut();
    }
  }, [kind, onSignOut]);
  if (kind === "auth") return <ScreenSkeleton />;
  if (kind === "network") return <OfflineState onRetry={onRetry} />;
  return <ErrorState onRetry={onRetry} onHome={onHome} />;
}

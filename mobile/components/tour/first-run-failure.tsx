import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LoadErrorKind } from "../../lib/api/load";
import { ROLE, SPACE } from "../../lib/brand/shared";
import { TextButton } from "../brand/controls";
import { Text } from "../brand/text";
import { LoadFailure } from "../feedback/states";

/**
 * A failed load before the app opens (the shell's profile, the guide's cards): the web's error / offline screen on the
 * bare canvas, since there is no tab bar yet. `detail` adds what only this failure can say (sign out and back in, check
 * the phone's time zone, update the app). Sign out is always there, so even a failure Try again can't fix has a way out.
 */
export function FirstRunFailure({
  kind,
  detail,
  canRetry = true,
  onRetry,
  onSignOut,
}: {
  kind: LoadErrorKind;
  detail?: string | null;
  canRetry?: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID="screen-root"
      style={{ flex: 1, backgroundColor: ROLE.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: SPACE.gutter,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        gap: 16,
      }}
    >
      {canRetry ? (
        <LoadFailure kind={kind} onRetry={onRetry} onSignOut={onSignOut} />
      ) : null}
      {detail ? (
        <Text testID="first-run-failure-detail" variant="input" color={canRetry ? ROLE.muted : ROLE.ink} accessibilityRole={canRetry ? undefined : "alert"}>
          {detail}
        </Text>
      ) : null}
      <View style={{ alignItems: "flex-start" }}>
        <TextButton testID="first-run-sign-out" icon="sign-out" onPress={onSignOut}>
          Sign out
        </TextButton>
      </View>
    </ScrollView>
  );
}

import { useEffect, useState } from "react";
import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { IconTile, TextButton } from "../brand/controls";
import { Text } from "../brand/text";

/** "Check your email", with the exits the web's version lacks on a phone: send it again, or use another address. */
export function SentState({
  email,
  onResend,
  waitSeconds,
  waitKey,
  resending,
  error,
  onUseDifferentEmail,
}: {
  email: string;
  onResend: () => void;
  /** seconds before "Send it again" (resendWaitSeconds), restarted whenever waitKey changes */
  waitSeconds: number;
  waitKey: number;
  resending: boolean;
  error: string | null;
  onUseDifferentEmail: () => void;
}) {
  const [wait, setWait] = useState(waitSeconds);
  useEffect(() => setWait(waitSeconds), [waitSeconds, waitKey]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <IconTile name="mail" />
      <Text variant="heading" accessibilityRole="header">
        Check your email
      </Text>
      <Text variant="body" color={ROLE.muted} testID="sign-in-sent">
        We sent a sign-in link to {email}. Open it on this phone to sign in.
      </Text>
      {error ? (
        <Text variant="formLabel" color={ROLE.neg} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ gap: 4, marginTop: 4 }}>
        <TextButton
          testID="sign-in-resend"
          icon="mail"
          disabled={wait > 0 || resending}
          onPress={onResend}
        >
          {resending ? "Sending…" : wait > 0 ? `Send it again in ${wait}s` : "Send it again"}
        </TextButton>
        <TextButton testID="sign-in-different-email" icon="edit" onPress={onUseDifferentEmail}>
          Use a different email
        </TextButton>
      </View>
    </View>
  );
}

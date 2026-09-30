import { ROLE } from "../../lib/brand/shared";
import { Text } from "../brand/text";

/** A page that wouldn't open in the in-app browser (lib/open-in-browser.ts), said like the other form messages. */
export function LinkError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Text testID="link-error" variant="small" color={ROLE.neg} accessibilityRole="alert">
      {message}
    </Text>
  );
}

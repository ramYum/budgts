import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import type { AuthLinkProblem } from "../../lib/auth/auth-errors";
import { SIGNED_IN_LINK_PROBLEM } from "../../lib/auth/callback-decision";
import { Button } from "../brand/controls";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { Stage } from "../kit/empty-state";

/**
 * A sign-in link that failed while the user is signed in (app/auth/callback.tsx): Crystal, curious, on her stage; that
 * nothing changed and why; one way back, to where the fresh sign-in was meant to return, else Home.
 */
export function LinkProblem({ problem, onBack }: { problem: AuthLinkProblem; onBack: () => void }) {
  return (
    <View testID="link-problem" accessibilityRole="alert" style={{ gap: 24 }}>
      <Stage>
        <Robin mood="curious" scale={4} />
        <View style={{ height: 4, width: 64, backgroundColor: ROLE.hairline }} />
      </Stage>
      <View style={{ gap: 8 }}>
        <Text variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
          {"This link didn't work"}
        </Text>
        <Text testID="link-problem-message" variant="input" color={ROLE.muted}>
          {SIGNED_IN_LINK_PROBLEM[problem]}
        </Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button testID="link-problem-back" size="lg" icon="back" onPress={onBack}>
          Go back
        </Button>
      </View>
    </View>
  );
}

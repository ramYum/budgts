import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ROLE } from "../lib/brand/shared";
import { Button } from "../components/brand/controls";
import { Robin } from "../components/brand/robin";
import { Text } from "../components/brand/text";
import { Stage } from "../components/kit/empty-state";
import { Badge } from "../components/kit/tiles";

/**
 * A missing screen (web src/components/not-found-view.tsx): Crystal, curious,
 * on her stage; what happened in plain words; the two ways out.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID="screen-root"
      style={{ flex: 1, backgroundColor: ROLE.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}
    >
      <View testID="not-found" style={{ gap: 24 }}>
        <Stage>
          <Text variant="pxFigureLg" color={ROLE.ink} style={{ paddingLeft: 4, letterSpacing: 4 }} accessibilityElementsHidden>
            404
          </Text>
          <Robin mood="curious" scale={4} />
          <View style={{ height: 4, width: 64, backgroundColor: ROLE.hairline }} />
        </Stage>
        <View style={{ gap: 8 }}>
          <Badge tone="wash">Page not found</Badge>
          <Text variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
            This page flew the nest.
          </Text>
          <Text variant="input" color={ROLE.muted}>
            The link may be old or mistyped. Nothing&apos;s wrong with your data.
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Button testID="not-found-home" size="lg" icon="home" onPress={() => router.replace("/")}>
            Go to Home
          </Button>
          <Button testID="not-found-help" variant="secondary" size="lg" icon="help" onPress={() => router.replace("/help")}>
            Get help
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HowItWorksView } from "../../../components/settings/how-it-works-view";
import { ROLE, SPACE } from "../../../lib/brand/shared";

/**
 * How Budgts works, opened from the welcome guide's last card while the guide still gates the app (Help, inside the app,
 * isn't open yet). The same view as Help's /help/how-it-works (components/settings/how-it-works-view.tsx), on the bare
 * canvas without the tabs. Back, and its "Play the welcome guide", return to the card the user left, still mounted
 * below; opened directly, they land on the guide.
 */
export default function FirstRunHowItWorksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toGuide = () => (router.canGoBack() ? router.back() : router.replace("/tour"));
  return (
    <ScrollView
      testID="screen-root"
      style={{ flex: 1, backgroundColor: ROLE.bg }}
      contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48 }}
    >
      <HowItWorksView onBack={toGuide} onGuide={toGuide} />
    </ScrollView>
  );
}

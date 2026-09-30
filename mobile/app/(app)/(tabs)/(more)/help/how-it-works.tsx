import { useRouter } from "expo-router";
import { HowItWorksView } from "../../../../../components/settings/how-it-works-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";

/** How Budgts works: the web's /help/how-it-works (components/settings/how-it-works-view.tsx). */
export default function HowItWorksScreen() {
  const router = useRouter();
  const onBack = useBack("/help");
  return (
    <Screen>
      <HowItWorksView onBack={onBack} onGuide={() => router.push("/tour")} />
    </Screen>
  );
}

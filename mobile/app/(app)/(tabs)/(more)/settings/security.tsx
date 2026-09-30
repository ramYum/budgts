import { useRouter } from "expo-router";
import { SecurityView } from "../../../../../components/settings/security-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";

/** Security: the web's /settings/security (components/settings/security-view.tsx). */
export default function SecurityScreen() {
  const router = useRouter();
  const onBack = useBack("/settings");
  return (
    <Screen>
      <SecurityView onBack={onBack} onHowItWorks={() => router.push("/help/how-it-works")} />
    </Screen>
  );
}

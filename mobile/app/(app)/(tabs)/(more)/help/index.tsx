import { useRouter, type Href } from "expo-router";
import { HelpView } from "../../../../../components/settings/help-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";

/** Help: the web's /help (components/settings/help-view.tsx). */
export default function HelpScreen() {
  const router = useRouter();
  const onBack = useBack("/more");
  return (
    <Screen>
      <HelpView onBack={onBack} go={(path) => router.push(path as Href)} />
    </Screen>
  );
}

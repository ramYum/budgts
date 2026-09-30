import { AppearanceView } from "../../../../../components/settings/appearance-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";

/** Appearance: the web's /settings/appearance (components/settings/appearance-view.tsx). */
export default function AppearanceScreen() {
  const onBack = useBack("/settings");
  return (
    <Screen>
      <AppearanceView onBack={onBack} />
    </Screen>
  );
}

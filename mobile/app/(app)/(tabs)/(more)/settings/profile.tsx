import * as Clipboard from "expo-clipboard";
import { ProfileView } from "../../../../../components/settings/profile-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";
import { useProfile } from "../../../../../lib/profile/profile-context";

/**
 * Profile: the web's /settings/profile (components/settings/profile-view.tsx), from the profile the signed-in shell
 * already holds (lib/profile/profile-context.tsx). The shell shows the app only once that profile is loaded, and
 * re-reads it when the app returns to the foreground.
 */
export default function ProfileScreen() {
  const onBack = useBack("/settings");
  const { state } = useProfile();
  if (state.status !== "ready") throw new Error("Profile needs the loaded profile the app shell gates on");
  return (
    <Screen>
      <ProfileView profile={state.profile} onBack={onBack} copy={(value) => Clipboard.setStringAsync(value)} />
    </Screen>
  );
}

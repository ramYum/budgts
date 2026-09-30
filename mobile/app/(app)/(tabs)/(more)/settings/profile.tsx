import * as Clipboard from "expo-clipboard";
import { ProfileView } from "../../../../../components/settings/profile-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";
import { loadResource } from "../../../../../lib/api/load";
import { useResource } from "../../../../../lib/api/use-resource";
import { authFetch } from "../../../../../lib/auth/api";
import { parseProfileDetails } from "../../../../../lib/settings/profile-details";

/** Profile: the web's /settings/profile (components/settings/profile-view.tsx). */
export default function ProfileScreen() {
  const onBack = useBack("/settings");
  const { state, refreshing, refresh, reload } = useResource("profile-details", (session) =>
    loadResource(() => authFetch("/api/mobile/profile", session), parseProfileDetails),
  );
  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      <ProfileView state={state} onBack={onBack} onRetry={() => void reload()} copy={(value) => Clipboard.setStringAsync(value)} />
    </Screen>
  );
}

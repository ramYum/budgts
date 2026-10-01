import { useRouter, type Href } from "expo-router";
import { MoreView } from "../../../../components/settings/more-view";
import { Screen } from "../../../../components/shell/screen";
import { useHub } from "../../../../lib/status/use-hub";

/** More: the web's /more hub (components/settings/more-view.tsx). */
export default function MoreScreen() {
  const router = useRouter();
  const { hub, notice, refresh } = useHub();
  return (
    <Screen name="more" notice={notice} onRetry={() => void refresh()}>
      <MoreView hub={hub} go={(path) => router.push(path as Href)} />
    </Screen>
  );
}

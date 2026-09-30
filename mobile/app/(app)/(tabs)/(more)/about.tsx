import * as WebBrowser from "expo-web-browser";
import { AboutView } from "../../../../components/settings/about-view";
import { useBack } from "../../../../components/settings/use-back";
import { Screen } from "../../../../components/shell/screen";
import { useLegalLinks } from "../../../../lib/use-legal-links";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/** About: the web's /about (components/settings/about-view.tsx); the legal rows open budgts.com in the in-app browser. */
export default function AboutScreen() {
  const onBack = useBack("/more");
  const legal = useLegalLinks(API_BASE);
  return (
    <Screen>
      <AboutView onBack={onBack} legal={legal} onOpen={(url) => void WebBrowser.openBrowserAsync(url)} />
    </Screen>
  );
}

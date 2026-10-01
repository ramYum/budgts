import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { AboutView } from "../../../../components/settings/about-view";
import { useBack } from "../../../../components/settings/use-back";
import { Screen } from "../../../../components/shell/screen";
import { openInBrowser } from "../../../../lib/open-in-browser";
import { useLegalLinks } from "../../../../lib/use-legal-links";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/** About: the web's /about (components/settings/about-view.tsx); the legal rows open budgts.com in the in-app browser. */
export default function AboutScreen() {
  const onBack = useBack("/more");
  const legal = useLegalLinks(API_BASE);
  const [linkError, setLinkError] = useState<string | null>(null);
  const open = async (url: string) => setLinkError(await openInBrowser(url, WebBrowser.openBrowserAsync));
  return (
    <Screen>
      <AboutView onBack={onBack} legal={legal} onOpen={(url) => void open(url)} linkError={linkError} />
    </Screen>
  );
}

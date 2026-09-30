import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useLoadingScreen } from "../../components/loading-screen";
import { ConnectBank } from "../../components/tour/connect-bank";
import { FirstRunFailure } from "../../components/tour/first-run-failure";
import { TourView } from "../../components/tour/tour-view";
import { loadResource } from "../../lib/api/load";
import { useResource } from "../../lib/api/use-resource";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { ROLE } from "../../lib/brand/shared";
import { useProfile } from "../../lib/profile/profile-context";
import { parseTourCards } from "../../lib/tour/tour-api";

/**
 * The welcome guide (web /tour), over `GET /api/mobile/tour`: right after Get Started it continues from the onboarding
 * cards (`new=1`, the web's `/tour?new=1`); a replay from More, or a first visit by someone onboarded elsewhere, starts
 * with Crystal's intro. Skip and the last card mark the guide seen, then Home opens.
 */
export default function TourScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { state: profileState, justOnboarded, completeTour } = useProfile();
  const tourSeen = profileState.status === "ready" && profileState.profile.tourSeen;
  // Resolved once for this visit: the cards must not reshuffle when the flag flips at the end.
  const [justOnboardedAtOpen] = useState(justOnboarded && !tourSeen);
  const path = `/api/mobile/tour${justOnboardedAtOpen ? "?new=1" : ""}`;
  const { state, reload } = useResource(`tour:${justOnboardedAtOpen}`, (session) => loadResource(() => authFetch(path, session), parseTourCards));
  useLoadingScreen(state.status === "loading", "Loading your welcome guide");

  // Home opens once the server has marked the guide seen and the gate has let the app in.
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (finished && tourSeen) router.replace("/");
  }, [finished, tourSeen, router]);

  const finish = useCallback(async () => {
    const result = await completeTour();
    if (result.status === "error") return result.message;
    setFinished(true);
    return null;
  }, [completeTour]);

  if (state.status === "loading") return <View style={{ flex: 1, backgroundColor: ROLE.bg }} />;
  if (state.status === "error") {
    return <FirstRunFailure kind={state.kind} onRetry={() => void reload()} onSignOut={() => void signOut()} />;
  }

  return (
    <TourView
      stepIds={state.data.stepIds}
      offset={state.data.offset}
      totalVisible={state.data.totalVisible}
      currency={state.data.currency}
      bank={(label) => <ConnectBank label={label} fullWidth />}
      onFinish={finish}
      onHowItWorks={tourSeen ? () => router.push("/help/how-it-works") : undefined}
    />
  );
}

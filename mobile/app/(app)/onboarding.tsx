import { useCallback } from "react";
import { View } from "react-native";
import { useLoadingScreen } from "../../components/loading-screen";
import { FirstRunFailure } from "../../components/tour/first-run-failure";
import { OnboardingView } from "../../components/tour/onboarding-view";
import { loadResource } from "../../lib/api/load";
import { useResource } from "../../lib/api/use-resource";
import { authFetch } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/auth-context";
import { ROLE } from "../../lib/brand/shared";
import { useProfile } from "../../lib/profile/profile-hooks";
import { parseOnboardingCards } from "../../lib/tour/tour-api";

/**
 * Get Started (web /onboarding): the welcome guide's first half, Crystal's cards ending on the currency, over
 * `GET /api/mobile/tour?phase=onboarding`. The shell's gate shows this screen until a currency is saved, then moves on
 * to the tour by itself.
 */
export default function OnboardingScreen() {
  const { state: profileState, chooseCurrency } = useProfile();
  const { signOut } = useAuth();
  const { state, reload } = useResource("onboarding-cards", (session) =>
    loadResource(() => authFetch("/api/mobile/tour?phase=onboarding", session), parseOnboardingCards),
  );
  // the egg keeps rolling from the profile load until the cards are here
  useLoadingScreen(state.status === "loading", "Loading your welcome guide");

  const submit = useCallback(
    async (currency: string) => {
      const result = await chooseCurrency(currency);
      return result.status === "error" ? result.message : null;
    },
    [chooseCurrency],
  );

  if (profileState.status !== "ready" || state.status === "loading") return <View style={{ flex: 1, backgroundColor: ROLE.bg }} />;
  if (state.status === "error") {
    return <FirstRunFailure kind={state.kind} onRetry={() => void reload()} onSignOut={() => void signOut()} />;
  }

  const profile = profileState.profile;
  return (
    <OnboardingView
      stepIds={state.data.stepIds}
      totalVisible={state.data.totalVisible}
      defaultCurrency={profile.currency}
      currencies={profile.supportedCurrencies}
      onSubmit={submit}
    />
  );
}

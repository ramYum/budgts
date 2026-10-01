import { createContext, useContext } from "react";
import type { CompleteTourResult } from "../tour/tour-api";
import type { ProfileState, SaveCurrencyResult } from "./profile-api";

export type ProfileContextValue = {
  state: ProfileState;
  /** Re-reads the profile (shows `loading`). Used after onboarding and for "Try again". */
  reload: () => Promise<void>;
  /**
   * Saves the first-run currency and the device's time zone. On success the profile is re-read in place (no loading
   * flash), so the shell's gate moves straight on to the welcome guide; "another device already did" reloads.
   */
  chooseCurrency: (currency: string) => Promise<SaveCurrencyResult>;
  /** True once this device finished Get Started this session, until the guide is done: the tour skips the intro cards
   * the user just saw and its progress continues from them (the web's `/tour?new=1`). */
  justOnboarded: boolean;
  /** The guide's last card or Skip: marks it seen on the server, then opens the app (the gate's `tourSeen`). */
  completeTour: () => Promise<CompleteTourResult>;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used inside <ProfileProvider>");
  return value;
}

/**
 * The user's own "this month" and "today", from the server. Only screens behind the onboarded gate call this, and an
 * onboarded profile always carries both (the parser refuses one that does not), so a missing value is a bug.
 */
export function useUserDates(): { month: string; today: string } {
  const { state } = useProfile();
  if (state.status !== "ready" || !state.profile.month || !state.profile.today) {
    throw new Error("useUserDates needs an onboarded, loaded profile");
  }
  return { month: state.profile.month, today: state.profile.today };
}

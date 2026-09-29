/**
 * Contract types of the smaller native screen reads (docs/specs/2026-09-17-mobile-app-launch-design.md §6): the welcome
 * guide, the More / Settings hub counts, the Accounts overview and the Delete account screen. Each is a projection of a
 * shared loader the web page uses; nothing here computes. The bigger screens have their own modules (`home.ts`,
 * `reads.ts`, `goals.ts`, `insights.ts`, `categories.ts`, `status.ts`).
 */
import type { DeletionScreenState } from "@/lib/account/deletion-screen";
import type { AccountsOverview } from "@/lib/accounts/load-accounts-overview";
import type { HubCounts } from "@/lib/hub-counts";
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";
import type { TourData } from "@/lib/tour/load-tour";
import type { TourStepId } from "@/lib/tour/steps";

type Versioned<T> = { version: typeof MOBILE_API_VERSION } & T;

/** `GET /api/mobile/tour?phase=onboarding`: Get Started's cards. */
export type MobileOnboardingCards = Versioned<{ phase: "onboarding"; stepIds: TourStepId[]; totalVisible: number }>;

/** `GET /api/mobile/tour`: the welcome guide's cards and what they show. */
export type MobileTour = Versioned<
  { phase: "tour"; seen: boolean } & Pick<TourData, "currency" | "accounts" | "stepIds" | "offset" | "totalVisible">
>;

export function buildMobileTour(tour: TourData, seen: boolean): MobileTour {
  return {
    version: MOBILE_API_VERSION,
    phase: "tour",
    seen,
    currency: tour.currency,
    accounts: tour.accounts.map((a) => ({ id: a.id, name: a.name })),
    stepIds: tour.stepIds,
    offset: tour.offset,
    totalVisible: tour.totalVisible,
  };
}

/** `GET /api/mobile/hub`: "2 goals", "1 bank" beside the More and Settings rows (`banks` null when banks are off). */
export type MobileHub = Versioned<HubCounts>;

/** `GET /api/mobile/accounts/overview`: grouped by linking bank, then by hand, then archived; `month` is the user's own. */
export type MobileAccountsOverview = Versioned<AccountsOverview>;

/** `GET /api/mobile/account/delete`: the Delete account screen's first state. */
export type MobileDeleteScreen = Versioned<DeletionScreenState>;

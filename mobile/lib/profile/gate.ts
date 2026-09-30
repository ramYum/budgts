import type { LoadErrorKind } from "../api/load";
import { firstRunRedirect } from "../tour/shared";
import type { MobileProfile, ProfileErrorKind } from "./profile-api";

export type ShellRoute = "onboarding" | "tour" | "app";

/**
 * Where the signed-in shell sends a loaded profile: the web's own first-run gate (src/lib/tour/gate.ts, imported, not
 * copied) over the profile's flags. Get Started until a currency is saved, then the welcome guide until it is finished or
 * skipped, then the app. The flags come from the server; a failed read never reaches here (the shell shows it instead of
 * guessing "seen").
 */
export function shellRoute(profile: Pick<MobileProfile, "onboarded" | "tourSeen">): ShellRoute {
  // the web gate reads the stored timestamps; only whether each is set matters to it
  const redirect = firstRunRedirect({
    onboarded_at: profile.onboarded ? "set" : null,
    tour_seen_at: profile.tourSeen ? "set" : null,
  });
  return redirect === "/onboarding" ? "onboarding" : redirect === "/tour" ? "tour" : "app";
}

/**
 * How a failed profile read shows in the shell: which of the web's failure screens (error, offline, back to sign-in for
 * an expired session), whether the failure's own words add something the screen doesn't say, and whether Try again can
 * help. Sign out is always offered beside it.
 */
export function profileFailure(kind: ProfileErrorKind): { kind: LoadErrorKind; detail: boolean; canRetry: boolean } {
  switch (kind) {
    case "auth":
    case "network":
    case "unavailable":
      return { kind, detail: false, canRetry: true };
    case "contract":
      return { kind, detail: true, canRetry: true };
    case "time_zone":
      return { kind: "rejected", detail: true, canRetry: true };
    case "profile_missing":
      // Try again can't make a missing profile appear: the way out is signing out and back in
      return { kind: "rejected", detail: true, canRetry: false };
  }
}

/**
 * Where the welcome guide's "How Budgts Works" link opens. Once the guide is seen (a replay from More), Help's own page,
 * inside the app. While the guide still gates the app, Help isn't open yet, so the same page opens on its own
 * first-run route, above the guide, with back returning to the card the user left.
 */
export function howItWorksHref(tourSeen: boolean): "/help/how-it-works" | "/guide/how-it-works" {
  return tourSeen ? "/help/how-it-works" : "/guide/how-it-works";
}

/** The first-run How Budgts Works route is open while the gate shows the welcome guide, and only then. */
export function firstRunHelpOpen(route: ShellRoute): boolean {
  return route === "tour";
}

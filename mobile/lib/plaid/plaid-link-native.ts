import { Platform } from "react-native";
import { createPlaidLinkSession, LinkEventName, type LinkExit, type LinkSuccess } from "react-native-plaid-link-sdk";
import type { LinkPlatform, PlaidLinkClient, PlaidLinkOutcome } from "./plaid-link";

/**
 * The device wiring for `PlaidLinkClient`: `react-native-plaid-link-sdk` v13 (`createPlaidLinkSession` /
 * `session.open()`, confirmed against the SDK's own published types — see `docs/specs/2026-09-21-mobile-only-transition-
 * design.md` §4B). Everything decision-worthy is in `link-flow.ts` (unit-tested); this file only connects the native
 * module and so needs an Expo **development build** to run at all — Expo Go does not include Plaid's native code, and
 * this repo has no device to run a dev build on. `isAvailable()` reports that honestly rather than crashing.
 *
 * OAuth institutions on native are handled by the SDK's own Universal Link (iOS) / App Link (Android) registration —
 * confirmed from the SDK's docs to need no manual deep-link handling in this app, unlike the web flow. That path is
 * unverified until a real device build exists with Associated Domains configured (owner-gated external step).
 */
export const currentPlatform = (): LinkPlatform => (Platform.OS === "android" ? "android" : "ios");

function isAvailable(): boolean {
  try {
    // The SDK throws synchronously (not a rejected promise) when its native module is absent, e.g. under Expo Go —
    // reading the version it reports is enough to prove the module is actually linked, without opening anything.
    return typeof require("react-native-plaid-link-sdk").sdkVersion === "string";
  } catch {
    return false;
  }
}

export function createPlaidLinkClient(): PlaidLinkClient {
  return {
    isAvailable,
    open: (linkToken: string) =>
      new Promise<PlaidLinkOutcome>((resolve, reject) => {
        void createPlaidLinkSession({
          token: linkToken,
          onSuccess: (success: LinkSuccess) => {
            resolve({
              kind: "success",
              publicToken: success.publicToken,
              institution: success.metadata.institution ? { id: success.metadata.institution.id, name: success.metadata.institution.name } : null,
            });
          },
          onExit: (exit: LinkExit) => {
            resolve({ kind: "exit", errorMessage: exit.error?.errorCode ?? null });
          },
          onEvent: (event) => {
            // ERROR events without a terminal onExit are the one case the SDK's callback contract doesn't otherwise
            // surface to the caller — treat it the same as an exit with that error code.
            if (event.eventName === LinkEventName.ERROR) resolve({ kind: "exit", errorMessage: event.metadata.errorCode ?? "ERROR" });
          },
        })
          .then((session) => session.open())
          .catch((e: unknown) => reject(e instanceof Error ? e : new Error("Plaid Link failed to start")));
      }),
  };
}

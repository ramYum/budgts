import { describe, expect, it, vi } from "vitest";
import appConfig from "../../app.json";

// The real expo-linking `createURL` (not a stub) runs below, with only its two
// native-facing dependencies faked to look like a standalone Android build —
// that is what the EAS preview APK is. This is what pins the root cause of the
// "Magic Link opens the web app" bug.
vi.mock("expo-constants", () => ({
  default: {
    executionEnvironment: "standalone",
    expoConfig: {
      scheme: "budgts",
      android: { package: "com.budgts.app" },
    },
  },
  ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
}));
vi.mock("expo-modules-core", () => ({
  Platform: { select: (spec: Record<string, unknown>) => spec.android },
}));

// Relative path: expo-linking's `exports` map does not expose build/createURL.
import { createURL } from "../../node_modules/expo-linking/build/createURL.js";
import { AUTH_CALLBACK_URL, buildAuthCallbackUrl, normalizeCallbackUrl } from "./callback-url";

/**
 * Supabase matches `redirect_to` against `uri_allow_list` EXACTLY, and silently
 * falls back to the project Site URL (the web app) on any mismatch — verified
 * against the staging project: `budgts://auth/callback` → the app,
 * `budgts:///auth/callback` → https://budgts-staging.vercel.app.
 */
const ALLOW_LISTED = "budgts://auth/callback";

describe("expo-linking createURL (the trap)", () => {
  it("a leading slash yields THREE slashes, which Supabase does not allow-list", () => {
    expect(createURL("/auth/callback")).toBe("budgts:///auth/callback");
    expect(createURL("/auth/callback")).not.toBe(ALLOW_LISTED);
  });

  it("no leading slash yields the allow-listed two-slash form", () => {
    expect(createURL("auth/callback")).toBe(ALLOW_LISTED);
  });
});

describe("buildAuthCallbackUrl", () => {
  it("produces exactly the allow-listed URL in a standalone build", () => {
    expect(buildAuthCallbackUrl(createURL)).toBe(ALLOW_LISTED);
  });

  it("still produces it if createURL ever returns the triple-slash form", () => {
    expect(buildAuthCallbackUrl(() => "budgts:///auth/callback")).toBe(ALLOW_LISTED);
  });

  it("leaves dev-client / Expo Go URLs alone (they are not allow-listed anyway)", () => {
    const expoGo = "exp://192.168.1.20:8081/--/auth/callback";
    expect(buildAuthCallbackUrl(() => expoGo)).toBe(expoGo);
  });
});

describe("normalizeCallbackUrl", () => {
  it("collapses a custom-scheme triple slash", () => {
    expect(normalizeCallbackUrl("budgts:///auth/callback")).toBe(ALLOW_LISTED);
  });

  it("does not touch an already-correct URL, an https URL, or a query string", () => {
    expect(normalizeCallbackUrl(ALLOW_LISTED)).toBe(ALLOW_LISTED);
    expect(normalizeCallbackUrl("https://budgts.com/auth/callback")).toBe(
      "https://budgts.com/auth/callback",
    );
    expect(normalizeCallbackUrl("budgts://auth/callback?code=a//b")).toBe(
      "budgts://auth/callback?code=a//b",
    );
  });
});

describe("AUTH_CALLBACK_URL contract", () => {
  it("is the exact string that must sit in Supabase's redirect allow-list", () => {
    expect(AUTH_CALLBACK_URL).toBe(ALLOW_LISTED);
  });

  it("stays in sync with the app.json scheme (the Android intent-filter's scheme)", () => {
    expect(AUTH_CALLBACK_URL.startsWith(`${appConfig.expo.scheme}://`)).toBe(true);
  });
});

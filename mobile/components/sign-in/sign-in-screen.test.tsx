import { describe, expect, it, vi } from "vitest";
import { BrandStage } from "../brand/brand-stage";
import { PixelFrame } from "../brand/pixel-frame";
import { render } from "../../test/render";
import SignInScreen from "../../app/sign-in";
import { SignInEntrance } from "./entrance";

/** The sign-in screen (app/sign-in.tsx) arrives the web's way: its stage, card and legal line go through SignInEntrance. */

vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({}) }));
vi.mock("expo-linking", () => ({ createURL: (p: string) => `budgts://${p}` }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: async () => ({}) }));
vi.mock("expo-apple-authentication", () => ({
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
}));
vi.mock("react-native-safe-area-context", async () => {
  const { createElement } = await import("react");
  return {
    SafeAreaView: ({ children }: { children?: import("react").ReactNode }) => createElement("SafeAreaView", null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
vi.mock("../../lib/supabase/client", () => ({ supabase: { auth: { signInWithOtp: async () => ({ error: null }) } } }));
vi.mock("../../lib/auth/apple-native", () => ({ isAppleSignInAvailable: async () => false, signInWithAppleNative: async () => ({}) }));
vi.mock("../../lib/auth/complete-session-from-url", () => ({ completeSessionFromUrl: async () => ({}) }));
vi.mock("../../lib/auth/google", () => ({ signInWithGoogle: async () => ({}) }));
vi.mock("../../lib/auth/reauth-guard", () => ({ takeSignInProblem: () => null }));
vi.mock("../../lib/use-legal-links", () => ({ useLegalLive: () => true }));

describe("the sign-in screen", () => {
  it("renders through SignInEntrance: the brand stage with the page, the card at --i 2, the legal line at --i 3", () => {
    const r = render(<SignInScreen />);
    const entrance = r.root.findByType(SignInEntrance);
    expect(entrance.props.stage.type).toBe(BrandStage);
    expect(entrance.props.legal).toBeTruthy();
    // the card is the entrance's own content
    expect(entrance.findAllByType(PixelFrame).some((f) => f.props.testID === "sign-in-card")).toBe(true);
  });
});

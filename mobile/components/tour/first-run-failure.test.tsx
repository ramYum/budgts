import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent } from "../../test/render";
import { FirstRunFailure } from "./first-run-failure";

vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {} } }));

describe("FirstRunFailure (a failed load before the app opens)", () => {
  it("shows the web's error screen with Try again, the failure's own words, and Sign out", () => {
    const onRetry = vi.fn();
    const onSignOut = vi.fn();
    const r = render(<FirstRunFailure kind="rejected" detail="Check its date and time settings." onRetry={onRetry} onSignOut={onSignOut} />);
    byTestId(r, "error-state-retry").props.onPress();
    byTestId(r, "first-run-sign-out").props.onPress();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(textContent(byTestId(r, "first-run-failure-detail"))).toBe("Check its date and time settings.");
  });

  it("shows the offline screen for a network failure", () => {
    const r = render(<FirstRunFailure kind="network" onRetry={() => {}} onSignOut={() => {}} />);
    expect(byTestId(r, "offline-state")).toBeTruthy();
  });

  it("offers only Sign out when trying again can't help, saying why", () => {
    const r = render(<FirstRunFailure kind="rejected" detail="Sign out, sign back in." canRetry={false} onRetry={() => {}} onSignOut={() => {}} />);
    expect(() => byTestId(r, "error-state-retry")).toThrow();
    expect(byTestId(r, "first-run-failure-detail").props.accessibilityRole).toBe("alert");
    expect(byTestId(r, "first-run-sign-out")).toBeTruthy();
  });
});

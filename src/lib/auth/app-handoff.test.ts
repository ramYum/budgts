import { describe, expect, it } from "vitest";
import { appHandoffUrl, isHandheld, linkProblem } from "./app-handoff";

describe("app sign-in hand-off", () => {
  it("hands the PKCE code to the app's own return", () => {
    expect(appHandoffUrl("?code=abc-123", "")).toBe("budgts://auth/callback?code=abc-123");
  });

  it("carries a failed link's fragment over as parameters the app reads", () => {
    const hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    const url = new URL(appHandoffUrl("", hash));
    expect(url.protocol).toBe("budgts:");
    expect(url.searchParams.get("error_code")).toBe("otp_expired");
    expect(url.searchParams.get("error")).toBe("access_denied");
  });

  it("keeps the query's value when the fragment repeats a key", () => {
    expect(appHandoffUrl("?code=q", "#code=h")).toBe("budgts://auth/callback?code=q");
  });

  it("opens the app's return even with nothing to carry", () => {
    expect(appHandoffUrl("", "")).toBe("budgts://auth/callback");
  });

  it("tells an expired link from any other failure", () => {
    expect(linkProblem("", "#error=access_denied&error_code=otp_expired")).toBe("expired");
    expect(linkProblem("?error=server_error", "")).toBe("failed");
    expect(linkProblem("?code=abc", "")).toBeNull();
  });

  it("knows a phone or tablet from a computer", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const android = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
    const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";
    expect(isHandheld(iphone, 5)).toBe(true);
    expect(isHandheld(android, 5)).toBe(true);
    expect(isHandheld(mac, 5)).toBe(true); // iPadOS Safari asks for the desktop site
    expect(isHandheld(mac, 0)).toBe(false);
    expect(isHandheld(windows, 0)).toBe(false);
  });
});

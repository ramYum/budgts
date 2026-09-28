import { describe, expect, it } from "vitest";
import { nativeLinkParams } from "./native-link-params";

describe("nativeLinkParams", () => {
  it("returns nothing extra for the web platform (unchanged existing behaviour)", () => {
    expect(nativeLinkParams({}, "web")).toEqual({});
    expect(nativeLinkParams({ ANDROID_PACKAGE_NAME: "com.budgts.app", PLAID_NATIVE_OAUTH_REDIRECT_URI: "https://budgts.com/app/plaid-oauth" }, undefined)).toEqual({});
  });

  it("android: sends android_package_name and never redirect_uri (Plaid rejects both together)", () => {
    expect(nativeLinkParams({ ANDROID_PACKAGE_NAME: "com.budgts.app" }, "android")).toEqual({
      android_package_name: "com.budgts.app",
    });
  });

  it("android: omits the param entirely when the package name isn't configured, rather than sending an empty string", () => {
    expect(nativeLinkParams({}, "android")).toEqual({});
  });

  it("ios: sends the native redirect_uri when configured, and never android_package_name", () => {
    expect(nativeLinkParams({ PLAID_NATIVE_OAUTH_REDIRECT_URI: "https://budgts.com/app/plaid-oauth" }, "ios")).toEqual({
      redirect_uri: "https://budgts.com/app/plaid-oauth",
    });
  });

  it("ios: omits redirect_uri when unset — OAuth banks won't complete on iOS until the owner registers and sets it, but every OTHER link-token create must keep working", () => {
    expect(nativeLinkParams({}, "ios")).toEqual({});
  });

  it("ios: refuses a non-https native redirect URI rather than sending it (Plaid requires https in production)", () => {
    expect(() => nativeLinkParams({ PLAID_NATIVE_OAUTH_REDIRECT_URI: "http://budgts.com/app/plaid-oauth" }, "ios")).toThrow();
  });
});

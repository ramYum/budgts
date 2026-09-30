import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR } from "./shared";
import { SPLASH_FADE_MS, loaderMotionAfterMs } from "./splash-motion";

type StylesXml = { resources: { style?: { $: { name: string; parent?: string }; item?: { $: { name: string }; _: string }[] }[] } };
const plugin = require("../../plugins/with-android-launch-egg.js") as {
  launchBackgroundXml: (paper: string) => string;
  releaseSplashHold: (mainActivity: string) => string;
  setLaunchWindowBackground: (styles: StylesXml) => StylesXml;
};

/**
 * Android's launch screen is the app window's own background: the resting egg on paper, where
 * the splash and the loader draw it. expo-splash-screen holds the window's first draw back until
 * JavaScript calls hide(); when anything else ends the splash first (React Native's "Loading from
 * Metro" popup in a debug build), the undrawn window shows black for seconds. So MainActivity
 * releases that hold as soon as it registers (plugins/with-android-launch-egg.js), and whatever
 * shows before React draws is the window background: the same standing egg.
 */

const appRoot = join(__dirname, "..", "..");
const expo = JSON.parse(readFileSync(join(appRoot, "app.json"), "utf8")).expo;
const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));

/** MainActivity.onCreate as expo prebuild generates it (SDK 57). */
const GENERATED_MAIN_ACTIVITY = `package com.budgts.app

import android.os.Bundle
import expo.modules.splashscreen.SplashScreenManager
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }
}
`;

const styles = (): StylesXml => ({
  resources: {
    style: [
      { $: { name: "AppTheme", parent: "Theme.AppCompat.DayNight.NoActionBar" }, item: [{ $: { name: "android:windowBackground" }, _: "@color/activityBackground" }] },
      { $: { name: "Theme.App.SplashScreen", parent: "Theme.SplashScreen" }, item: [] },
    ],
  },
});

describe("Android launch: MainActivity releases the splash hold", () => {
  it("calls SplashScreenManager.hide() right after registerOnActivity, before the activity draws", () => {
    const out = plugin.releaseSplashHold(GENERATED_MAIN_ACTIVITY);
    const register = out.indexOf("SplashScreenManager.registerOnActivity(this)");
    const hide = out.indexOf("SplashScreenManager.hide()");
    expect(register).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(register);
    expect(hide).toBeLessThan(out.indexOf("super.onCreate"));
    // outside expo's own generated block, so re-running expo's mod keeps it
    expect(hide).toBeGreaterThan(out.indexOf("// @generated end expo-splashscreen"));
  });

  it("is listed before expo-splash-screen, so its mod runs after expo's has written registerOnActivity", () => {
    // config-plugin mods run in reverse order of registration: the later plugin's mod goes first
    const names = expo.plugins.map((p: string | [string]) => (Array.isArray(p) ? p[0] : p));
    expect(names.indexOf("./plugins/with-android-launch-egg")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("./plugins/with-android-launch-egg")).toBeLessThan(names.indexOf("expo-splash-screen"));
  });

  it("adds it exactly once, and running again changes nothing", () => {
    const once = plugin.releaseSplashHold(GENERATED_MAIN_ACTIVITY);
    expect(once.match(/SplashScreenManager\.hide\(\)/g)).toHaveLength(1);
    expect(plugin.releaseSplashHold(once)).toBe(once);
  });

  it("fails loudly if expo-splash-screen stops registering on MainActivity (an SDK change)", () => {
    expect(() => plugin.releaseSplashHold(GENERATED_MAIN_ACTIVITY.replace("SplashScreenManager.registerOnActivity(this)", ""))).toThrow(
      /registerOnActivity/,
    );
  });

  it("needs no patched dependency: no patch, no module built from source", () => {
    expect(existsSync(join(appRoot, "patches"))).toBe(false);
    expect(pkg.scripts.postinstall).toBeUndefined();
    expect(pkg.expo?.autolinking).toBeUndefined();
  });
});

describe("Android launch: the window background is the launch screen", () => {
  it("sets AppTheme's android:windowBackground to the launch drawable, replacing the plain colour", () => {
    const out = plugin.setLaunchWindowBackground(styles());
    const appTheme = out.resources.style!.find((s) => s.$.name === "AppTheme")!;
    const bg = appTheme.item!.filter((i) => i.$.name === "android:windowBackground");
    expect(bg).toEqual([{ $: { name: "android:windowBackground" }, _: "@drawable/launch_background" }]);
    // the splash theme is left alone
    expect(out.resources.style!.find((s) => s.$.name === "Theme.App.SplashScreen")!.item).toEqual([]);
  });

  it("draws paper with the splash's own egg centred, unfiltered", () => {
    expect(expo.plugins).toContain("./plugins/with-android-launch-egg");
    const xml = plugin.launchBackgroundXml(expo.backgroundColor);
    expect(xml).toContain(`android:color="${expo.backgroundColor}"`);
    expect(expo.backgroundColor.toLowerCase()).toBe(COLOR.paper);
    expect(xml).toMatch(/<bitmap android:gravity="center" android:src="@drawable\/launch_egg" android:filter="false"/);
    // one exact-size egg per density, the splash's (tools/generate-app-icons.mjs)
    for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) expect(existsSync(join(appRoot, `assets/splash/egg-${d}.png`)), d).toBe(true);
  });
});

describe("Android launch: when the egg rolls", () => {
  it("rolls at once on Android; on iOS only once the splash has faded off it", () => {
    expect(loaderMotionAfterMs("android", false)).toBe(0);
    expect(loaderMotionAfterMs("ios", false)).toBeNull();
    expect(loaderMotionAfterMs("ios", true)).toBe(SPLASH_FADE_MS);
  });
});

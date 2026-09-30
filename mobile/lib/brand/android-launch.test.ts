import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR } from "./shared";
import { SPLASH_FADE_MS, loaderMotionAfterMs } from "./splash-motion";
const plugin = require("../../plugins/with-android-launch-egg.js") as { launchBackgroundXml: (paper: string) => string };

/**
 * Android's launch screen is the app window's own background: the resting egg on paper, where
 * the splash and the loader draw it. expo-splash-screen held the window's first draw back until
 * JavaScript called hide(); when anything else ended the splash first (React Native's "Loading
 * from Metro" popup in a debug build, a second activity in a warm process), the undrawn window
 * showed black for seconds. So the draw is never held (patches/expo-splash-screen+*.patch), and
 * whatever shows before React draws is the window background: the same standing egg.
 */

const appRoot = join(__dirname, "..", "..");
const expo = JSON.parse(readFileSync(join(appRoot, "app.json"), "utf8")).expo;

describe("Android launch", () => {
  it("never holds the window's first draw back (patched on install, and built from that patched source)", () => {
    const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
    expect(pkg.scripts.postinstall).toBe("patch-package");
    // Expo ships its modules to Gradle prebuilt (node_modules/<pkg>/local-maven-repo): a patch to
    // the Kotlin source changes nothing unless the module is built from source
    expect(pkg.expo.autolinking.android.buildFromSource).toContain("expo-splash-screen");
    const version = JSON.parse(readFileSync(join(appRoot, "node_modules/expo-splash-screen/package.json"), "utf8")).version;
    // the patch is for exactly the installed version: patch-package refuses a mismatched one
    expect(existsSync(join(appRoot, `patches/expo-splash-screen+${version}.patch`))).toBe(true);
    const source = readFileSync(
      join(appRoot, "node_modules/expo-splash-screen/android/src/main/java/expo/modules/splashscreen/SplashScreenManager.kt"),
      "utf8",
    );
    const register = source.slice(source.indexOf("fun registerOnActivity"));
    expect(register.slice(0, register.indexOf("installSplashScreen"))).toMatch(/keepSplashScreenOnScreen = false/);
  });

  it("makes the window background the launch screen: paper with the splash's own egg centred", () => {
    expect(expo.plugins).toContain("./plugins/with-android-launch-egg");
    const xml = plugin.launchBackgroundXml(expo.backgroundColor);
    expect(xml).toContain(`android:color="${expo.backgroundColor}"`);
    expect(expo.backgroundColor.toLowerCase()).toBe(COLOR.paper);
    expect(xml).toMatch(/<bitmap android:gravity="center" android:src="@drawable\/launch_egg" android:filter="false"/);
    // one exact-size egg per density, the splash's (tools/generate-app-icons.mjs)
    for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) expect(existsSync(join(appRoot, `assets/splash/egg-${d}.png`)), d).toBe(true);
  });

  it("rolls the egg at once on Android; on iOS only once the splash has faded off it", () => {
    expect(loaderMotionAfterMs("android", false)).toBe(0);
    expect(loaderMotionAfterMs("ios", false)).toBeNull();
    expect(loaderMotionAfterMs("ios", true)).toBe(SPLASH_FADE_MS);
  });
});

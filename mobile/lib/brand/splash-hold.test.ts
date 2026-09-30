import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * expo-splash-screen keeps "hold the splash" in a flag that lives as long as the Android process
 * and is never set again, so a second MainActivity in a warm process (a relaunch after Back, a
 * reload) dropped its splash on the first frame, onto an empty window, seconds before the loading
 * screen drew. patches/expo-splash-screen+*.patch re-arms it per activity (applied by postinstall);
 * app/_layout.tsx releases it once the loader has laid out.
 */

const appRoot = join(__dirname, "..", "..");

describe("the native splash is held per activity", () => {
  it("is patched on install", () => {
    const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
    expect(pkg.scripts.postinstall).toBe("patch-package");
    const version = JSON.parse(readFileSync(join(appRoot, "node_modules/expo-splash-screen/package.json"), "utf8")).version;
    // the patch is for exactly the installed version: patch-package refuses a mismatched one
    expect(() => readFileSync(join(appRoot, `patches/expo-splash-screen+${version}.patch`), "utf8")).not.toThrow();
  });

  it("re-arms the hold when each activity registers", () => {
    const source = readFileSync(
      join(appRoot, "node_modules/expo-splash-screen/android/src/main/java/expo/modules/splashscreen/SplashScreenManager.kt"),
      "utf8",
    );
    const register = source.slice(source.indexOf("fun registerOnActivity"));
    expect(register.slice(0, register.indexOf("installSplashScreen"))).toMatch(/keepSplashScreenOnScreen = true/);
  });
});

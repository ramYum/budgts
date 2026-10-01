import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Android cold launch could die with SIGSEGV in MountingCoordinator::pullTransaction (thread
 * mqt_v_js): react-native-screens <= 4.27 lazily created its RNSScreenRemovalListener (a Fabric
 * mounting-override delegate) without a lock, from two threads on a cold start
 * (ScreensModule.initialize() and onHostResume()). The racing shared_ptr writes could leave the
 * registered delegate pointing at a freed listener, and the next commit called through it.
 * Upstream fixed it in 4.28.0 (software-mansion/react-native-screens#4413); Expo SDK 57 pins
 * ~4.26, so patches/react-native-screens+4.26.2.patch backports that fix verbatim.
 *
 * react-native-screens is not an Expo module, so its C++ is compiled from node_modules and the
 * patch reaches the APK (mobile/README.md, "Native patches"). Once Expo's bundled version is
 * 4.28.0 or later, drop the patch and patch-package; this test then fails on purpose.
 */
const appRoot = join(__dirname, "..");
const screensRoot = join(appRoot, "node_modules/react-native-screens");
const read = (rel: string) => readFileSync(join(screensRoot, rel), "utf8");

describe("react-native-screens launch-crash backport", () => {
  const version = JSON.parse(read("package.json")).version as string;

  it("is patched only while the installed version lacks the upstream fix", () => {
    const [major, minor] = version.split(".").map(Number);
    expect(major === 4 && minor < 28, `react-native-screens ${version} has #4413; remove the patch`).toBe(true);
    const patches = readdirSync(join(appRoot, "patches"));
    expect(patches).toContain(`react-native-screens+${version}.patch`);
    const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
    expect(pkg.scripts.postinstall).toBe("patch-package");
  });

  it("registers one process-lifetime listener, never a lazily created per-proxy one", () => {
    const proxy = read("android/src/main/cpp/NativeProxy.cpp");
    expect(proxy).toContain("static const std::shared_ptr<RNSScreenRemovalListener> instance");
    expect(proxy).toContain("setMountingOverrideDelegate(removalListener())");
    expect(proxy).not.toContain("screenRemovalListener_");
    expect(proxy).not.toMatch(/\[this\]\(int tag\)/);
    expect(read("android/src/main/cpp/NativeProxy.h")).not.toContain("screenRemovalListener_");
  });

  it("swaps the callback under a lock and disarms it on invalidation", () => {
    const listener = read("cpp/RNSScreenRemovalListener.cpp");
    expect(listener).toContain("std::lock_guard<std::mutex> lock(listenerMutex_)");
    expect(listener).toMatch(/if \(!listener\)/);
    expect(read("android/src/main/cpp/NativeProxy.cpp")).toContain("clearListener(removalListenerToken_)");
  });

  it("is compiled from source, so the patch reaches the native library", () => {
    expect(existsSync(join(screensRoot, "android/CMakeLists.txt"))).toBe(true);
    expect(existsSync(join(screensRoot, "android/local-maven-repo"))).toBe(false);
  });
});

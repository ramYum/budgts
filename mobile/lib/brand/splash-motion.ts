/** How long the iOS splash takes to fade off the loader (SplashScreen.setOptions). */
export const SPLASH_FADE_MS = 200;

/**
 * When the loading screen's egg may start rolling, in ms (null: not yet).
 * iOS: not while the native splash still covers it, then once the splash has
 * faded off it, so the egg rolls from exactly where the splash left it.
 * Android: at once. The app window's own background is the standing egg on
 * paper (plugins/with-android-launch-egg.js) and the splash left at the
 * window's first frame, so nothing covers the loader and nothing waits on
 * JavaScript to lift it.
 */
export function loaderMotionAfterMs(os: string, splashGone: boolean): number | null {
  if (os === "android") return 0;
  return splashGone ? SPLASH_FADE_MS : null;
}

/**
 * The app's fonts: the web's own files in src/app/fonts (Metro watches that
 * folder), one family per weight. `fonts.test.ts` keeps this list equal to
 * FONT_FILES in the shared tokens. Loaded once, before the splash screen
 * hides (app/_layout.tsx).
 */
export const FONT_SOURCES = {
  "Geist-Regular": require("../../../src/app/fonts/geist/Geist-Regular.ttf"),
  "Geist-Medium": require("../../../src/app/fonts/geist/Geist-Medium.ttf"),
  "Geist-SemiBold": require("../../../src/app/fonts/geist/Geist-SemiBold.ttf"),
  "GeistMono-Regular": require("../../../src/app/fonts/geist/GeistMono-Regular.ttf"),
  "Dogica-Bold": require("../../../src/app/fonts/dogica/dogicabold.ttf"),
  "Dogica-Pixel": require("../../../src/app/fonts/dogica/dogicapixel.ttf"),
};

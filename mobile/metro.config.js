// Metro for the Budgts app. The app shares the web's brand sources instead of
// copying them (docs/BRAND_GUIDELINES.md, "Native apps"), so Metro also
// watches those folders of the web app next door, and nothing else of it.
//
// It resolves packages only from this app's own node_modules: the web app's
// ../node_modules (a different React, Next) must never reach the bundle. The
// shared modules import no packages at all (tests/unit/brand-purity.test.ts),
// and ../node_modules is outside every watched folder, so Metro can't see it.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const appRoot = __dirname;
const webRoot = path.resolve(appRoot, "..");

/**
 * The web folders the app reads: tokens, frames, robin and egg art and icons; Crystal's walk; the pure display figures
 * both sides print; the font files; the welcome guide's words (src/components/tour/guide-copy.ts) and first-run gate
 * (src/lib/tour/gate.ts, steps.ts). The app imports only those pure files from the tour folders, never their React or
 * server modules.
 */
const SHARED = ["src/lib/brand", "src/lib/crystal", "src/lib/figures", "src/app/fonts", "src/lib/tour", "src/components/tour"].map((dir) => path.join(webRoot, dir));

const config = getDefaultConfig(appRoot);

config.watchFolders = [...(config.watchFolders ?? []), ...SHARED];
config.resolver.nodeModulesPaths = [path.join(appRoot, "node_modules")];
// Belt and braces: even if a watched folder ever widened, never serve a file
// from the web app's node_modules or build output.
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escape(path.join(webRoot, "node_modules"))}[\\\\/]`),
  new RegExp(`^${escape(path.join(webRoot, ".next"))}[\\\\/]`),
];

function escape(p) {
  return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = config;

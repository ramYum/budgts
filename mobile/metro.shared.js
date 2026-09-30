// What Metro may read of the web app next door, kept apart from metro.config.js
// so tests check it without loading Expo's Metro config (seconds of work).
const path = require("node:path");

const appRoot = __dirname;
const webRoot = path.resolve(appRoot, "..");

/**
 * The web folders the app may read, and the one list of them (tests/unit/brand-purity.test.ts checks that every web
 * file the app imports sits in one of these and is pure TypeScript):
 * - the brand: tokens, frames, robin and egg art, icons, figure size, test ids; Crystal's walk; the font files;
 * - pure display helpers: money formatting and parsing, dates and month labels, the greeting, display names;
 * - screen constants the web and the app share: the deletion screen's words and paths, category options, the welcome
 *   guide's steps, gate and words.
 * Never the money math (src/lib/budget, src/lib/plaid): figures come from the server.
 */
const SHARED = [
  "src/lib/brand",
  "src/lib/crystal",
  "src/app/fonts",
  "src/lib/display",
  "src/lib/account",
  "src/lib/categories",
  "src/lib/tour",
  "src/components/tour",
];

function escape(p) {
  return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Never serve a file from the web app's node_modules or build output, even if a watched folder ever widened. */
const BLOCKED = [new RegExp(`^${escape(path.join(webRoot, "node_modules"))}[\\\\/]`), new RegExp(`^${escape(path.join(webRoot, ".next"))}[\\\\/]`)];

module.exports = {
  SHARED,
  watchFolders: SHARED.map((dir) => path.join(webRoot, dir)),
  nodeModulesPaths: [path.join(appRoot, "node_modules")],
  BLOCKED,
};

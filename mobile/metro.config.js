// Metro for the Budgts app. The app shares the web's own sources instead of
// copying them (docs/BRAND_GUIDELINES.md, "Native apps"), so Metro also
// watches those folders of the web app next door, and nothing else of it
// (metro.shared.js: the one list).
//
// It resolves packages only from this app's own node_modules: the web app's
// ../node_modules (a different React, Next) must never reach the bundle. The
// shared modules import no packages at all (tests/unit/brand-purity.test.ts),
// and ../node_modules is outside every watched folder, so Metro can't see it.
const { getDefaultConfig } = require("expo/metro-config");
const { watchFolders, nodeModulesPaths, BLOCKED } = require("./metro.shared");

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), ...watchFolders];
config.resolver.nodeModulesPaths = nodeModulesPaths;
config.resolver.blockList = [...[].concat(config.resolver.blockList ?? []), ...BLOCKED];

module.exports = config;

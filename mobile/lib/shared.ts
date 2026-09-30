/**
 * The web's pure display helpers and screen constants, imported as they are
 * (never copied): Metro serves them through `watchFolders` (metro.shared.js
 * `SHARED`). tests/unit/brand-purity.test.ts keeps every web file the app
 * imports pure TypeScript that Hermes can run, and inside a SHARED folder.
 * Figures are never computed here: these only format what the server sent.
 */
export * from "../../src/lib/display/money";
export * from "../../src/lib/display/dates";
export * from "../../src/lib/display/local-date";
export * from "../../src/lib/display/display-name";
export * from "../../src/lib/account/screen";
export * from "../../src/lib/categories/options";
export * from "../../src/lib/display/charts";

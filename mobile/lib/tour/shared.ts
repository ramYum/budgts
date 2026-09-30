/**
 * The welcome guide's shared web sources, imported rather than copied (Metro `watchFolders`, mobile/metro.config.js):
 * its words, one entry per card (src/components/tour/guide-copy.ts), and the first-run gate (src/lib/tour/gate.ts).
 * Both are pure TypeScript with no package imports, so they run under Hermes as they do in the browser.
 */
export { GUIDE_COPY, type GuideCopy } from "../../../src/components/tour/guide-copy";
export { firstRunRedirect, type FirstRunProfile } from "../../../src/lib/tour/gate";
export type { TourStepId } from "../../../src/lib/tour/steps";

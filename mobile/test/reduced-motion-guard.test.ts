import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One reduced-motion source: every animated part of the app asks components/motion/reduced-motion.ts whether motion is
 * off, so Crystal, the money roll and every entrance agree, and follow the setting while the app runs. Only that module
 * may read Reanimated's `useReducedMotion` (a reading taken once at launch) or ask the OS itself. Test files are excluded.
 */
const ROOT = join(__dirname, "..");
const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;
const MODULE = "components/motion/reduced-motion.ts";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return SOURCE.test(name) && !TEST.test(name) ? [relative(ROOT, path).split("\\").join("/")] : [];
  });
}

const appSources = () => ["app", "components", "lib"].flatMap((d) => sources(join(ROOT, d)));

/** Reanimated's hook, however it is reached: a named import (one or many lines, renamed or not) or a namespace member. */
const READS_REANIMATED_HOOK = (code: string) =>
  [...code.matchAll(/import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']react-native-reanimated["']/g)].some((m) => /\buseReducedMotion\b/.test(m[1]!)) ||
  /\b(?:Animated|Reanimated)\.useReducedMotion\b/.test(code) ||
  /require\(\s*["']react-native-reanimated["']\s*\)\s*\.useReducedMotion/.test(code);

/** Asking the OS directly, around the module. */
const ASKS_THE_OS = (code: string) => /\bisReduceMotionEnabled\b|["']reduceMotionChanged["']|\bReducedMotionConfig\b/.test(code);

describe("one reduced-motion source", () => {
  it("only the motion module reads Reanimated's useReducedMotion", () => {
    const readers = appSources().filter((f) => READS_REANIMATED_HOOK(readFileSync(join(ROOT, f), "utf8")));
    expect(readers).toEqual([MODULE]);
  });

  it("only the motion module asks the OS whether motion is off", () => {
    const askers = appSources().filter((f) => ASKS_THE_OS(readFileSync(join(ROOT, f), "utf8")));
    expect(askers).toEqual([MODULE]);
  });

  it("the guard catches every way of importing it", () => {
    expect(READS_REANIMATED_HOOK(`import Animated, { steps, useReducedMotion } from "react-native-reanimated";`)).toBe(true);
    expect(READS_REANIMATED_HOOK(`import {\n  Easing,\n  useReducedMotion as reduced,\n} from 'react-native-reanimated';`)).toBe(true);
    expect(READS_REANIMATED_HOOK(`import Animated from "react-native-reanimated";\nAnimated.useReducedMotion();`)).toBe(true);
    expect(READS_REANIMATED_HOOK(`import { useReducedMotion } from "../motion/reduced-motion";`)).toBe(false);
  });
});

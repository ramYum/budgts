import { createContext, useContext, type ReactNode } from "react";

/**
 * Development builds only: a frozen motion clock for parity captures
 * (tools/parity, Phase 3 plan P4). With `budgts://…?clock=<ms>` every CSS
 * animation is paused at that many ms after the screen mounted, which is how
 * the web captures freeze `document.getAnimations()` at the same time; the
 * two sides can then be compared mid-motion. Release builds ignore it: the
 * provider only ever passes a value in __DEV__.
 */
const ParityClock = createContext<number | null>(null);

export function ParityClockProvider({ frozenAtMs, children }: { frozenAtMs: number | null; children: ReactNode }) {
  return <ParityClock.Provider value={__DEV__ ? frozenAtMs : null}>{children}</ParityClock.Provider>;
}

/** `?clock=1200` → 1200; anything else → null. */
export function parseClockParam(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string" || !/^\d{1,6}$/.test(s)) return null;
  return Number(s);
}

/**
 * The timing props for an animation that starts `delayMs` after mount: as is,
 * or, under a frozen parity clock, paused at that instant (a negative delay
 * seeks into the animation; paused holds it there).
 */
export function useMotionTiming(delayMs: number): { animationDelay: `${number}ms`; animationPlayState: "running" | "paused" } {
  const frozen = useContext(ParityClock);
  if (frozen === null) return { animationDelay: `${delayMs}ms`, animationPlayState: "running" };
  return { animationDelay: `${delayMs - frozen}ms`, animationPlayState: "paused" };
}

import { ROAM } from "../../lib/brand/shared";
import type { Face, Hop } from "./roam-plan";

/**
 * Crystal's walk poses, as worklets over her own clock (web crystal-perch.tsx
 * `HOP_ARC`, `HOP_FLAP`, `PECK` and globals.css `.crystal-mover`'s slide).
 * Pure functions of time, so a frame shows exactly what the web shows at the
 * same instant, and the tests read them directly.
 */

/** CSS `cubic-bezier(x1, y1, x2, y2)` at progress `x` (0…1). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  "worklet";
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  // solve for the curve's parameter at this x (Newton, then bisection if it stalls)
  let u = x;
  for (let i = 0; i < 8; i++) {
    const err = ((ax * u + bx) * u + cx) * u - x;
    const d = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(err) < 1e-6) break;
    if (Math.abs(d) < 1e-6) {
      let lo = 0;
      let hi = 1;
      u = x;
      for (let j = 0; j < 30; j++) {
        const v = ((ax * u + bx) * u + cx) * u;
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
      break;
    }
    u -= err / d;
  }
  return ((ay * u + by) * u + cy) * u;
}

/** The mover's slide between stops: `transition: transform 360ms cubic-bezier(0.45, 0, 0.55, 1)`. */
export const SLIDE_MS = 360;

/** Her place on the edge (0…1) at `t`: the last hop's slide, eased. */
export function placeAt(hops: readonly Hop[], t: number): number {
  "worklet";
  let f: number = ROAM.startF;
  for (let k = hops.length - 1; k >= 0; k--) {
    const h = hops[k]!;
    if (h.at > t) continue;
    const p = (t - h.at) / SLIDE_MS;
    f = p >= 1 ? h.to : h.from + (h.to - h.from) * cubicBezier(0.45, 0, 0.55, 1, p);
    break;
  }
  return f;
}

/** Which way she faces at `t`: right (1) until the first turn. */
export function facingAt(faces: readonly Face[], t: number): number {
  "worklet";
  let facing = 1;
  for (let k = faces.length - 1; k >= 0; k--) {
    if (faces[k]!.at <= t) {
      facing = faces[k]!.facing;
      break;
    }
  }
  return facing;
}

/** The hop under way at `t` as progress 0…1, or -1 between hops. */
export function hopProgress(hops: readonly Hop[], t: number): number {
  "worklet";
  for (let k = hops.length - 1; k >= 0; k--) {
    const h = hops[k]!;
    if (h.at > t) continue;
    const p = (t - h.at) / ROAM.hopMs;
    return p < 1 ? p : -1;
  }
  return -1;
}

/**
 * `HOP_ARC`: a crouch, a 9px arc, a squash on landing, from her feet.
 * none → scale(1.08, .9) @14% (linear) → translateY(-9) scale(.96, 1.05) @50% (ease out) → none @84% (ease in)
 * → scale(1.06, .94) @92% → none.
 */
export function hopArc(p: number): { y: number; sx: number; sy: number } {
  "worklet";
  if (p < 0 || p >= 1) return { y: 0, sx: 1, sy: 1 };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  if (p < 0.14) {
    const k = p / 0.14;
    return { y: 0, sx: lerp(1, 1.08, k), sy: lerp(1, 0.9, k) };
  }
  if (p < 0.5) {
    const k = cubicBezier(0, 0.55, 0.45, 1, (p - 0.14) / 0.36);
    return { y: lerp(0, -9, k), sx: lerp(1.08, 0.96, k), sy: lerp(0.9, 1.05, k) };
  }
  if (p < 0.84) {
    const k = cubicBezier(0.55, 0, 1, 0.45, (p - 0.5) / 0.34);
    return { y: lerp(-9, 0, k), sx: lerp(0.96, 1, k), sy: lerp(1.05, 1, k) };
  }
  if (p < 0.92) {
    const k = (p - 0.84) / 0.08;
    return { y: 0, sx: lerp(1, 1.06, k), sy: lerp(1, 0.94, k) };
  }
  const k = (p - 0.92) / 0.08;
  return { y: 0, sx: lerp(1.06, 1, k), sy: lerp(0.94, 1, k) };
}

/** `HOP_FLAP`: her wing beats twice through the hop (steps(1, end) at 14, 34, 54, 74%). */
export function hopWing(p: number): number {
  "worklet";
  return (p >= 0.14 && p < 0.34) || (p >= 0.54 && p < 0.74) ? 1 : 0;
}

/** `PECK` (700ms): two pecks, 3px down and forward, at 20–40% and 60–80%. */
export const PECK_MS = 700;

export function peckOffset(pecks: readonly number[], t: number): number {
  "worklet";
  for (let k = pecks.length - 1; k >= 0; k--) {
    const at = pecks[k]!;
    if (at > t) continue;
    const q = (t - at) / PECK_MS;
    if (q >= 1) return 0;
    return (q >= 0.2 && q < 0.4) || (q >= 0.6 && q < 0.8) ? 3 : 0;
  }
  return 0;
}

/** Whether anything of the walk is moving at `t` (a slide, a hop, a peck, a turn just made): only then does a frame need drawing. */
export function walkMoving(hops: readonly Hop[], faces: readonly Face[], pecks: readonly number[], t: number): boolean {
  "worklet";
  for (let k = hops.length - 1; k >= 0; k--) {
    const h = hops[k]!;
    if (h.at > t) continue;
    if (t - h.at < Math.max(SLIDE_MS, ROAM.hopMs)) return true;
    break;
  }
  for (let k = faces.length - 1; k >= 0; k--) {
    const f = faces[k]!;
    if (f.at > t) continue;
    if (t - f.at < 100) return true;
    break;
  }
  for (let k = pecks.length - 1; k >= 0; k--) {
    const at = pecks[k]!;
    if (at > t) continue;
    if (t - at < PECK_MS) return true;
    break;
  }
  return false;
}

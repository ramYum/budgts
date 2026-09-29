import { describe, expect, it } from "vitest";
import {
  EGG_FRAMES,
  EGG_GROUND,
  EGG_GROUND_PALETTE,
  EGG_LOOP,
  EGG_PALETTE,
  EGG_PERIMETER,
  eggFoot,
  eggSvg,
  type EggFrame,
} from "./egg-art";
import { ROBIN_ART } from "./robin-art";
import { COLOR, ROLE } from "./tokens";

/** Crystal's egg (egg-art.ts): the native loader's frames and the splash image. */

type Grid = (string | undefined)[][];
function grid(f: EggFrame): Grid {
  const g: Grid = Array.from({ length: f.h }, () => Array<string | undefined>(f.w).fill(undefined));
  for (const r of f.runs)
    for (let i = 0; i < r.w; i++) {
      expect(g[r.y]![r.x + i], `overlapping runs at ${r.x + i},${r.y}`).toBeUndefined();
      g[r.y]![r.x + i] = r.fill;
    }
  return g;
}
const at = (g: Grid, x: number, y: number) => g[y]?.[x];
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const cellsOf = (g: Grid, pred: (fill: string) => boolean) =>
  g.flatMap((row, y) => row.flatMap((fill, x) => (fill && pred(fill) ? [[x, y] as const] : [])));
const isOutline = (f?: string) => f === EGG_PALETTE.outline;
const isShell = (f?: string) => !!f && f !== EGG_PALETTE.outline;
const isSpeckle = (f?: string) => f === EGG_PALETTE.speckle || f === EGG_PALETTE.speckleLight;
/** The silhouette as text rows ("#" outline, "o" shell), for mirror checks. */
const silhouette = (g: Grid) => g.map((row) => row.map((f) => (isOutline(f) ? "#" : f ? "o" : ".")).join(""));
const byAngle = (a: number) => EGG_FRAMES.find((f) => f.angle === a)!;

describe("egg art: palette", () => {
  it("paints only Crystal's own colours and brand tokens: no new hue", () => {
    const allowed = new Set<string>([
      ...Object.values(COLOR),
      ...Object.values(ROLE),
      ...Object.values(ROBIN_ART).flatMap((art) => Object.values(art).flatMap((runs) => runs.map((r) => r.fill))),
    ].map((c) => c.toLowerCase()));
    for (const c of [...Object.values(EGG_PALETTE), ...Object.values(EGG_GROUND_PALETTE)]) expect(allowed, c).toContain(c);
    for (const f of EGG_FRAMES) for (const r of f.runs) expect(Object.values(EGG_PALETTE)).toContain(r.fill);
  });
});

describe("egg art: frames", () => {
  it("draws every rotation of the roll, at 22.5° steps, the resting (standing) frame first", () => {
    expect(EGG_FRAMES[0]!.angle).toBe(270);
    for (let a = 0; a < 360; a += 22.5) expect(byAngle(a), `${a}°`).toBeDefined();
    expect(EGG_FRAMES).toHaveLength(16); // no wobble frames: every frame is a roll
    expect(new Set(EGG_FRAMES.map((f) => f.angle)).size).toBe(EGG_FRAMES.length);
  });

  for (const f of EGG_FRAMES) {
    describe(`${f.angle}°`, () => {
      const g = grid(f);

      it("fills its box: outline on all four sides, runs inside it", () => {
        for (const r of f.runs) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(f.w);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeLessThan(f.h);
        }
        expect(g[0]!.some(isOutline)).toBe(true);
        expect(g[f.h - 1]!.some(isOutline)).toBe(true);
        expect(g.some((row) => isOutline(row[0]))).toBe(true);
        expect(g.some((row) => isOutline(row[f.w - 1]))).toBe(true);
      });

      it("rests on the ground: its lowest row is outline, right under the contact point", () => {
        const bottom = g[f.h - 1]!;
        expect(bottom.every((c) => c === undefined || isOutline(c))).toBe(true);
        expect(isOutline(bottom[Math.floor(f.contactX)])).toBe(true);
      });

      it("has a clean 1-cell outline: exactly the shell's 4-neighbour ring, never doubled", () => {
        for (const [x, y] of cellsOf(g, isShell))
          for (const [dx, dy] of N4) expect(at(g, x + dx, y + dy), `shell ${x},${y} is open`).toBeDefined();
        for (const [x, y] of cellsOf(g, isOutline)) {
          expect(N4.some(([dx, dy]) => isShell(at(g, x + dx, y + dy))), `stray outline ${x},${y}`).toBe(true);
          // a 2×2 block of outline is a doubled corner
          expect(isOutline(at(g, x + 1, y)) && isOutline(at(g, x, y + 1)) && isOutline(at(g, x + 1, y + 1)), `doubled ${x},${y}`).toBe(false);
        }
      });

      it("has no jaggies: each edge steps out to its widest point, then back in", () => {
        const profiles: number[][] = [];
        const rows = g.map((row) => row.map((c, x) => (isShell(c) ? x : -1)).filter((x) => x >= 0)).filter((r) => r.length);
        profiles.push(rows.map((r) => r[0]!), rows.map((r) => -r[r.length - 1]!));
        const cols = Array.from({ length: f.w }, (_, x) => g.map((row, y) => (isShell(row[x]) ? y : -1)).filter((y) => y >= 0)).filter((c) => c.length);
        profiles.push(cols.map((c) => c[0]!), cols.map((c) => -c[c.length - 1]!));
        for (const p of profiles) {
          const signs = p.slice(1).map((v, i) => Math.sign(v - p[i]!)).filter((s) => s !== 0);
          const turns = signs.slice(1).filter((s, i) => s !== signs[i]).length;
          expect(turns, `edge ${p.join(",")}`).toBeLessThanOrEqual(1);
        }
      });

      it("has no orphan pixels: shade in bands, speckles apart and clear of the outline", () => {
        for (const [x, y] of cellsOf(g, (c) => c === EGG_PALETTE.shade))
          expect(N4.some(([dx, dy]) => at(g, x + dx, y + dy) === EGG_PALETTE.shade), `lone shade ${x},${y}`).toBe(true);
        const speckles = cellsOf(g, isSpeckle);
        expect(speckles).toHaveLength(5);
        for (const [x, y] of speckles)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const n = at(g, x + dx, y + dy);
              expect(isSpeckle(n) || isOutline(n) || n === undefined, `speckle ${x},${y} touches ${n}`).toBe(false);
            }
      });
    });
  }

  it("is symmetric: standing, the egg mirrors left to right; lying, top to bottom; half a turn mirrors it left to right", () => {
    const standing = silhouette(grid(byAngle(270)));
    expect(standing).toEqual(standing.map((row) => [...row].reverse().join("")));
    const lying = silhouette(grid(byAngle(0)));
    expect([...lying].reverse()).toEqual(lying);
    expect(silhouette(grid(byAngle(180)))).toEqual(lying.map((row) => [...row].reverse().join("")));
  });

  it("turns symmetrically: the frame at -θ is the frame at θ mirrored top to bottom", () => {
    for (const f of EGG_FRAMES) {
      const twin = EGG_FRAMES.find((o) => o.angle === (360 - f.angle) % 360);
      if (!twin) continue;
      expect(silhouette(grid(twin)), `${f.angle}°`).toEqual([...silhouette(grid(f))].reverse());
    }
  });
});

describe("egg art: the loop", () => {
  const pitch = EGG_GROUND.cell + EGG_GROUND.gap;

  it("rolls from its first step, and comes home to rest for a beat at the end of the lap", () => {
    expect(EGG_LOOP[0]).toMatchObject({ frame: 0, x: 0 });
    expect(EGG_LOOP[1]!.frame).not.toBe(0);
    const tail = EGG_LOOP.slice(-3);
    expect(tail.every((s) => s.frame === 0 && s.x === 0)).toBe(true);
    // resting steps: the lap's end plus one beat at each turnaround, never more
    const still = EGG_LOOP.filter((s, i) => i > 0 && s.frame === EGG_LOOP[i - 1]!.frame).length;
    expect(still).toBeLessThanOrEqual(4);
  });

  it("is a real end-over-end roll: half a turn right, a whole turn left, half a turn right, 32 rolling steps", () => {
    let turned = 0;
    let rolling = 0;
    for (let i = 1; i < EGG_LOOP.length; i++) {
      const a = EGG_FRAMES[EGG_LOOP[i - 1]!.frame]!.angle;
      const b = EGG_FRAMES[EGG_LOOP[i]!.frame]!.angle;
      if (a === b) continue;
      rolling++;
      const d = ((b - a + 540) % 360) - 180; // signed, in (-180, 180]
      expect(Math.abs(d)).toBe(22.5);
      turned += d;
    }
    expect(rolling).toBe(32);
    expect(turned).toBe(0); // home again
  });

  it("rolls, never slides: a step moves the egg only when it turns, by the shell's arc", () => {
    const stepArc = EGG_PERIMETER / 16; // one 22.5° step's arc, give or take the egg's shape
    for (let i = 1; i < EGG_LOOP.length; i++) {
      const a = EGG_LOOP[i - 1]!;
      const b = EGG_LOOP[i]!;
      const contactA = a.x + EGG_FRAMES[a.frame]!.contactX;
      const contactB = b.x + EGG_FRAMES[b.frame]!.contactX;
      if (a.frame === b.frame) expect(b.x, `step ${i}`).toBe(a.x);
      else expect(Math.abs(contactB - contactA), `step ${i}`).toBeLessThanOrEqual(stepArc * 1.6 + 1);
    }
  });

  it("travels half the shell each way from the middle: a whole shell end to end", () => {
    const contacts = EGG_LOOP.map((s) => s.x + EGG_FRAMES[s.frame]!.contactX - EGG_FRAMES[0]!.contactX);
    const right = Math.max(...contacts);
    const left = Math.min(...contacts);
    expect(Math.abs(right + left)).toBeLessThanOrEqual(1); // symmetric about the middle
    expect(Math.abs(right - left - EGG_PERIMETER)).toBeLessThanOrEqual(1.5);
  });

  it("marks where the egg stands, and the cells it just left, fading once it stops", () => {
    EGG_LOOP.forEach((s, i) => {
      const contact = s.x + EGG_FRAMES[s.frame]!.contactX - EGG_GROUND.left;
      expect(s.lit).toBe(Math.floor(contact / pitch));
      expect(s.trail.length).toBeLessThanOrEqual(2);
      expect(s.trail).not.toContain(s.lit);
      const recent = [1, 2, 3].map((k) => EGG_LOOP[(i - k + EGG_LOOP.length) % EGG_LOOP.length]!.lit);
      for (const c of s.trail) expect(recent).toContain(c);
    });
    // never under the egg's foot: an ink cell there reads as a stalk under the shell
    for (const s of EGG_LOOP) {
      const [from, to] = eggFoot(s);
      for (const c of s.trail) {
        const x = EGG_GROUND.left + c * pitch;
        expect(x >= to || x + EGG_GROUND.cell <= from, `cell ${c} under the foot ${from}-${to}`).toBe(true);
      }
    }
    // at rest at the lap's end, the trail has faded away
    expect(EGG_LOOP[EGG_LOOP.length - 1]!.trail).toEqual([]);
  });

  it("keeps the egg's contact point on the row of cells", () => {
    for (const s of EGG_LOOP) {
      expect(s.lit).toBeGreaterThanOrEqual(0);
      expect(s.lit).toBeLessThan(EGG_GROUND.count);
    }
  });

  it("sits the ground on whole cells, centred under the resting egg", () => {
    expect(Number.isInteger(EGG_GROUND.left)).toBe(true);
    expect(EGG_GROUND.left * 2 + EGG_GROUND.width).toBe(EGG_FRAMES[0]!.w);
  });
});

describe("egg art: splash image", () => {
  it("centres the resting egg on the canvas at whole px", () => {
    const svg = eggSvg({ size: 68, scale: 4 });
    const xs = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const f = EGG_FRAMES[0]!;
    expect(Math.min(...xs.map((p) => p[0]!))).toBe(Math.round((68 - f.w * 4) / 2));
    expect(Math.min(...xs.map((p) => p[1]!))).toBe(Math.round((68 - f.h * 4) / 2));
  });
});

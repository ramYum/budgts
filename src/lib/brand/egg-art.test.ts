import { describe, expect, it } from "vitest";
import {
  EGG_FRAMES,
  EGG_GROUND,
  EGG_GROUND_PALETTE,
  EGG_LOOP,
  EGG_PALETTE,
  EGG_PERIMETER,
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
    for (let a = 180; a <= 360; a += 22.5) expect(byAngle(a % 360), `${a}°`).toBeDefined();
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

  it("starts and ends at rest, so it repeats without a jump", () => {
    expect(EGG_LOOP[0]).toMatchObject({ frame: 0, x: 0 });
    expect(EGG_LOOP[EGG_LOOP.length - 1]).toMatchObject({ frame: 0, x: 0 });
  });

  it("rolls, never slides: a step moves the egg only when it turns, by the shell's arc", () => {
    const quarterArc = EGG_PERIMETER / 16; // one 22.5° step's arc, give or take the egg's shape
    for (let i = 1; i < EGG_LOOP.length; i++) {
      const a = EGG_LOOP[i - 1]!;
      const b = EGG_LOOP[i]!;
      const contactA = a.x + EGG_FRAMES[a.frame]!.contactX;
      const contactB = b.x + EGG_FRAMES[b.frame]!.contactX;
      if (a.frame === b.frame) expect(b.x, `step ${i}`).toBe(a.x);
      else expect(Math.abs(contactB - contactA), `step ${i}`).toBeLessThanOrEqual(quarterArc * 1.6 + 1);
    }
  });

  it("rolls a quarter turn each way from standing, over the blunt end it stands on: the same way each side, less than half the shell", () => {
    const at = (angle: number) =>
      EGG_LOOP.filter((s) => EGG_FRAMES[s.frame]!.angle === angle).map((s) => s.x + EGG_FRAMES[s.frame]!.contactX - EGG_FRAMES[0]!.contactX);
    const right = Math.max(...at(0));
    const left = Math.min(...at(180));
    expect(right).toBeGreaterThan(0);
    expect(left).toBeLessThan(0);
    expect(Math.abs(right + left)).toBeLessThanOrEqual(1);
    expect(right - left).toBeLessThan(EGG_PERIMETER / 2); // the blunt end is the shorter way round
  });

  it("lights the ground cell under the egg, and fades the one it just left", () => {
    EGG_LOOP.forEach((s, i) => {
      const contact = s.x + EGG_FRAMES[s.frame]!.contactX - EGG_GROUND.left;
      expect(s.lit).toBe(Math.floor(contact / pitch));
      const before = EGG_LOOP[(i + EGG_LOOP.length - 1) % EGG_LOOP.length]!.lit;
      expect(s.trail).toBe(i > 0 && before !== s.lit ? before : -1);
    });
  });

  it("keeps the egg over the ground at both ends", () => {
    for (const s of EGG_LOOP) {
      expect(s.x).toBeGreaterThanOrEqual(EGG_GROUND.left);
      expect(s.x + EGG_FRAMES[s.frame]!.w).toBeLessThanOrEqual(EGG_GROUND.left + EGG_GROUND.width);
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

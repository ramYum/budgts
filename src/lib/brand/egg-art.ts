/** Crystal's egg as pixel art: one source for the native loading screen
 * (mobile/components/brand/egg-loader.tsx) and the native splash image
 * (tools/generate-app-icons.mjs). docs/BRAND_GUIDELINES.md → Motion.
 *
 * A speckled egg, standing on its blunt end, tips over and rolls end over end
 * along a row of the brand's square progress cells, rocks to rest on its
 * side, and rolls back. Every rotation is its own pre-drawn frame,
 * never a rotated image: the shell is rasterised from one egg curve at each
 * angle, cleaned of spurs and notches, then given Crystal's 1-cell charcoal
 * outline, a shade side away from the light (upper left, fixed while the egg
 * turns), a small glint and speckles in Crystal's browns (which turn with it).
 *
 * The loop is sprite-timed (one frame per step) and rolls without slipping:
 * each step moves the egg by the arc of shell that met the ground, so the
 * frames stand on the same ground line and never slide.
 *
 * Pure data + pure functions, no imports, so the icon tool can load it with
 * Node's type stripping and the app can bundle it (tests/unit/brand-purity.test.ts). */

export type EggRun = { x: number; y: number; w: number; fill: string };

export type EggFrame = {
  /** clockwise turn from lying on its side, pointed end to the right */
  angle: number;
  /** size in cells, outline included */
  w: number;
  h: number;
  /** one-cell-tall runs, in cells from the frame's top-left */
  runs: EggRun[];
  /** where the shell meets the ground, in cells from the frame's left edge */
  contactX: number;
};

export type EggStep = {
  /** index into EGG_FRAMES */
  frame: number;
  /** the frame's left edge, in cells from the resting frame's left edge */
  x: number;
  /** the ground cell under the egg (index into the ground row) */
  lit: number;
  /** the cell it just left, fading (-1: none) */
  trail: number;
};

/** The palette: Crystal's outline, belly and browns (robin-art.ts) and the brand's paper white. */
export const EGG_PALETTE = {
  outline: "#111111", // Crystal's K
  shell: "#f6f3ee", // Crystal's belly W
  shade: "#d8d2c8", // Crystal's belly shade w
  glint: "#ffffff", // Crystal's eye glint h
  speckle: "#7b4a2b", // Crystal's head & back B
  speckleLight: "#a8703f", // Crystal's crown b
} as const;

/** The ground row's colours: brand tokens (tokens.ts ROLE.track, ROLE.ink, ROLE.cellPast). */
export const EGG_GROUND_PALETTE = {
  track: "#e6e6e6",
  lit: "#111111",
  trail: "#c9c9c9",
} as const;

// The egg curve, lying on its side: two half-ellipses meeting at the widest
// point (the origin, which the egg turns about), half-height B. The blunt end
// (left) reaches BLUNT cells, the pointed end (right) POINTED: a smooth convex
// egg, so every rotation rasterises to clean steps.
const BLUNT = 6;
const POINTED = 8;
const B = 5.2;

function inside(x: number, y: number): boolean {
  const a = x < 0 ? BLUNT : POINTED;
  return (x / a) ** 2 + (y / B) ** 2 <= 1 + 1e-9;
}

// Light from the upper left, fixed while the egg turns (world cells, y down).
const SHADE_REACH: [number, number] = [1.1, 1.4]; // a cell is in shade if this far down-right is outside the shell
const GLINT_AT = 0.58; // of the way from the centre to the shell, toward the light
const LIGHT: [number, number] = [-0.6, -0.8];

// Speckles on the shell (egg cells, lying, pointed end right), clustered toward
// the blunt end like a real egg. They turn with the egg.
const SPECKLES: [x: number, y: number, light: boolean][] = [
  [-4, -2, false],
  [-5, 1, true],
  [-2, 2, false],
  [0, -2, true],
  [3, 1, true],
];

type Cell = [number, number];
const key = (x: number, y: number) => `${x},${y}`;
const N4: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Local egg coordinates of a world point, for a clockwise turn of `deg`. */
function toLocal(deg: number, X: number, Y: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c * X + s * Y, -s * X + c * Y];
}
function toWorld(deg: number, x: number, y: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c * x - s * y, s * x + c * y];
}

/** The shell's cells at a turn: cell centres on the integer grid, the egg's centre on one. */
function shellCells(deg: number): Set<string> {
  const R = POINTED + 2;
  const cells = new Set<string>();
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const [x, y] = toLocal(deg, i, j);
      if (inside(x, y)) cells.add(key(i, j));
    }
  // Clean edges for pixel art: drop one-cell spurs, fill one-cell notches, until stable.
  for (let changed = true; changed; ) {
    changed = false;
    const around = (i: number, j: number) => N4.filter(([dx, dy]) => cells.has(key(i + dx, j + dy))).length;
    for (let j = -R; j <= R; j++)
      for (let i = -R; i <= R; i++) {
        const k = key(i, j);
        const n = around(i, j);
        if (cells.has(k) && n <= 1) {
          cells.delete(k);
          changed = true;
        } else if (!cells.has(k) && n >= 3) {
          cells.add(k);
          changed = true;
        }
      }
  }
  return cells;
}

/** Normalise a turn into [0, 360), so the loop's -180° and 180° share a frame. */
function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** The shell's silhouette at `deg` mirrored top to bottom is the silhouette at
 * `-deg` (the egg is symmetric about its long axis); drawing the second half of
 * the turn that way keeps the pairs exact whatever floating point does. */
function silhouette(deg: number): Set<string> {
  const d = norm(deg);
  if (d <= 180) return shellCells(d);
  const mirrored = new Set<string>();
  for (const k of shellCells(360 - d)) {
    const [i, j] = k.split(",").map(Number) as [number, number];
    mirrored.add(key(i, -j));
  }
  return mirrored;
}

// The shell's outline, densely sampled once: the contact point and the arc each step rolls over.
const BOUNDARY: { x: number; y: number; s: number }[] = (() => {
  const M = 2880;
  const pts: { x: number; y: number; s: number }[] = [];
  for (let k = 0; k < M; k++) {
    const phi = (2 * Math.PI * k) / M;
    const dx = Math.cos(phi);
    const dy = Math.sin(phi);
    let lo = 0;
    let hi = POINTED * 2;
    for (let n = 0; n < 40; n++) {
      const mid = (lo + hi) / 2;
      if (inside(mid * dx, mid * dy)) lo = mid;
      else hi = mid;
    }
    pts.push({ x: lo * dx, y: lo * dy, s: 0 });
  }
  for (let k = 1; k < M; k++) pts[k]!.s = pts[k - 1]!.s + Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y);
  return pts;
})();
/** The shell's full outline length, in cells: how far one whole turn rolls. */
export const EGG_PERIMETER =
  BOUNDARY[BOUNDARY.length - 1]!.s + Math.hypot(BOUNDARY[0]!.x - BOUNDARY[BOUNDARY.length - 1]!.x, BOUNDARY[0]!.y - BOUNDARY[BOUNDARY.length - 1]!.y);

/** The boundary sample touching the ground at a turn: the lowest point in the world. */
function contact(deg: number): { X: number; s: number } {
  let best = BOUNDARY[0]!;
  let bestY = -Infinity;
  for (const p of BOUNDARY) {
    const Y = toWorld(deg, p.x, p.y)[1];
    if (Y > bestY + 1e-9) {
      bestY = Y;
      best = p;
    }
  }
  return { X: toWorld(deg, best.x, best.y)[0], s: best.s };
}

function frameAt(deg: number): EggFrame {
  const shell = silhouette(deg);
  const has = (i: number, j: number) => shell.has(key(i, j));
  const cells = [...shell].map((k) => k.split(",").map(Number) as Cell);

  const outline = new Set<string>();
  for (const [i, j] of cells)
    for (const [dx, dy] of N4) if (!has(i + dx, j + dy)) outline.add(key(i + dx, j + dy));
  const all = [...cells, ...[...outline].map((k) => k.split(",").map(Number) as Cell)];
  const minX = Math.min(...all.map((c) => c[0]));
  const maxX = Math.max(...all.map((c) => c[0]));
  const minY = Math.min(...all.map((c) => c[1]));
  const maxY = Math.max(...all.map((c) => c[1]));

  const fill = new Map<string, string>();
  for (const [i, j] of cells) fill.set(key(i, j), EGG_PALETTE.shell);

  // The shade side: cells whose down-right neighbourhood leaves the shell.
  const shade = new Set<string>();
  for (const [i, j] of cells) {
    const [x, y] = toLocal(deg, i + SHADE_REACH[0], j + SHADE_REACH[1]);
    if (!inside(x, y)) shade.add(key(i, j));
  }
  // no lone shade cells: a shade cell needs a shade neighbour
  for (const k of [...shade]) {
    const [i, j] = k.split(",").map(Number) as Cell;
    if (!N4.some(([dx, dy]) => shade.has(key(i + dx, j + dy)))) shade.delete(k);
  }
  for (const k of shade) fill.set(k, EGG_PALETTE.shade);

  // The glint: two cells toward the light, where the shell is lit.
  {
    let r = 0;
    while (inside(...toLocal(deg, (r + 0.05) * LIGHT[0], (r + 0.05) * LIGHT[1]))) r += 0.05;
    const gi = Math.round(r * GLINT_AT * LIGHT[0]);
    const gj = Math.round(r * GLINT_AT * LIGHT[1]);
    for (const [i, j] of [
      [gi, gj],
      [gi + 1, gj - 1],
    ] as Cell[])
      if (fill.get(key(i, j)) === EGG_PALETTE.shell) fill.set(key(i, j), EGG_PALETTE.glint);
  }

  // Speckles turn with the shell; each lands on its nearest cell.
  // Each speckle takes the nearest cell to where it turned to that keeps it
  // clear of the outline and of the other speckles (no touching, even
  // diagonally), so every frame shows all of them as clean single dots.
  const placed: Cell[] = [];
  const clear = (i: number, j: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!has(i + dx, j + dy)) return false;
        if (placed.some(([pi, pj]) => pi === i + dx && pj === j + dy)) return false;
      }
    return true;
  };
  for (const [sx, sy, light] of SPECKLES) {
    const [X, Y] = toWorld(deg, sx, sy);
    const near: Cell[] = [];
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) near.push([Math.round(X) + di, Math.round(Y) + dj]);
    near.sort((p, q) => Math.hypot(p[0] - X, p[1] - Y) - Math.hypot(q[0] - X, q[1] - Y) || p[1] - q[1] || p[0] - q[0]);
    const spot = near.find(([i, j]) => clear(i, j));
    if (!spot) continue; // (the tests pin every frame to all five)
    placed.push(spot);
    fill.set(key(...spot), light ? EGG_PALETTE.speckleLight : EGG_PALETTE.speckle);
  }

  for (const k of outline) fill.set(k, EGG_PALETTE.outline);

  const sorted = [...fill].map(([k, f]) => [...(k.split(",").map(Number) as Cell), f] as const).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const runs: EggRun[] = [];
  for (const [i, j, f] of sorted) {
    const x = i - minX;
    const y = j - minY;
    const last = runs[runs.length - 1];
    if (last && last.y === y && last.x + last.w === x && last.fill === f) last.w += 1;
    else runs.push({ x, y, w: 1, fill: f });
  }
  return {
    angle: norm(deg),
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    runs,
    contactX: contact(deg).X - (minX - 0.5),
  };
}

/** One step of the loop in the art's own terms: the egg's turn. */
type Pose = number;

const ROLL_STEP = 22.5; // 16 frames a turn
const ROCK = 6; // the settle wobble's lean: about one cell of roll

function rollTurns(from: number, to: number): Pose[] {
  const dir = Math.sign(to - from);
  const out: Pose[] = [];
  for (let a = from + dir * ROLL_STEP; dir > 0 ? a <= to : a >= to; a += dir * ROLL_STEP) out.push(a);
  return out;
}
const hold = (pose: Pose, steps: number): Pose[] => Array.from({ length: steps }, () => pose);

/** The resting pose: standing on its blunt end, pointed end up, the egg
 * everyone draws. It is the native splash's egg. */
const REST = -90;

/** The loop, as turns (degrees, clockwise = rolling right), one per step. It
 * starts standing in the middle, tips over and rolls right a quarter turn
 * onto its side, rocks and settles, rolls back left half a turn (standing up
 * as it passes the middle) onto its other side, rocks and settles, and rolls
 * right a quarter turn to stand again. */
const LOOP_POSES: Pose[] = [
  ...hold(REST, 6),
  ...rollTurns(REST, 0),
  ROCK,
  ROCK,
  0,
  -ROCK / 2,
  ...hold(0, 5),
  ...rollTurns(0, -180),
  -180 - ROCK,
  -180 - ROCK,
  -180,
  -180 + ROCK / 2,
  ...hold(-180, 5),
  ...rollTurns(-180, REST),
];

/** Every distinct frame the loop draws, the resting frame first. */
export const EGG_FRAMES: EggFrame[] = (() => {
  const angles: number[] = [];
  for (const a of LOOP_POSES.map(norm)) if (!angles.includes(a)) angles.push(a);
  return angles.map(frameAt);
})();

const frameIndex = (deg: number) => EGG_FRAMES.findIndex((f) => f.angle === norm(deg));

/** The ground: a row of the brand's square progress cells under the egg, in
 * cells. `drop` is the paper between the egg's lowest cell and the row (as
 * Crystal's shadow sits under her feet on sign-in), so the lit cell reads as
 * the egg's place on the track, never as a stalk under it. */
export const EGG_GROUND = (() => {
  const cell = 2;
  const gap = 1;
  const count = 14;
  const drop = 1;
  const width = count * (cell + gap) - gap;
  const rest = EGG_FRAMES[0]!;
  // centred under the resting egg, which the splash centres on the screen
  const left = (rest.w - width) / 2;
  return { cell, gap, count, drop, width, left };
})();

/** The loop, one entry per step, from rest back to rest. */
export const EGG_LOOP: EggStep[] = (() => {
  const rest = EGG_FRAMES[0]!;
  let X = 0; // the contact point's travel, in cells, from rest
  let prev = contact(REST);
  let prevDeg = REST;
  let lastLit = -1;
  const pitch = EGG_GROUND.cell + EGG_GROUND.gap;
  return LOOP_POSES.map((deg) => {
    const c = contact(deg);
    if (deg !== prevDeg) {
      let ds = Math.abs(c.s - prev.s);
      ds = Math.min(ds, EGG_PERIMETER - ds);
      X += Math.sign(deg - prevDeg) * ds;
    }
    prev = c;
    prevDeg = deg;
    const frame = frameIndex(deg);
    const f = EGG_FRAMES[frame]!;
    const contactWorld = rest.contactX + X; // from the resting frame's left edge
    const x = Math.round(contactWorld - f.contactX);
    // the cell under the contact point as drawn (the frame on whole cells)
    const lit = Math.floor((x + f.contactX - EGG_GROUND.left) / pitch);
    const trail = lastLit >= 0 && lastLit !== lit ? lastLit : -1;
    lastLit = lit;
    return { frame, x, lit, trail };
  });
})();

/** One step of the loop lasts this long: sprite timing, like the robin's hops. */
export const EGG_STEP_MS = 80;

/** Standalone SVG markup of one frame, `scale` px per cell, its top-left at (`x`, `y`). */
export function eggFrameRects(frame: EggFrame, scale: number, x = 0, y = 0): string {
  return frame.runs
    .map((r) => `<rect x="${x + r.x * scale}" y="${y + r.y * scale}" width="${r.w * scale}" height="${scale}" fill="${r.fill}"/>`)
    .join("");
}

/** The resting egg (frame 0) centred on a `size`×`size` canvas at `scale` px
 * per cell: the native splash image. Centred to the same whole cell as the
 * loader draws it. */
export function eggSvg({ size, scale, background }: { size: number; scale: number; background?: string }): string {
  const f = EGG_FRAMES[0]!;
  const ox = Math.round((size - f.w * scale) / 2);
  const oy = Math.round((size - f.h * scale) / 2);
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${bg}${eggFrameRects(f, scale, ox, oy)}</svg>`;
}

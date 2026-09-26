/** The Budgts robin as pixel art: one source for the in-app mascot
 * (src/components/mascot.tsx) and the app icons (tools/generate-app-icons.mjs).
 *
 * A 24×20 character grid; every empty cell touching the bird becomes a 1-cell
 * outline, so the art is 26×22 cells including the outline. Pure data + pure
 * functions, no imports, so the icon tool can load it with Node's type
 * stripping. */

export type RobinMood = "normal" | "happy" | "curious" | "sleepy";

export type RobinRun = { x: number; y: number; w: number; fill: string };

/** `beak` is the shut lower beak and `beakOpen` what replaces it mid-chirp;
 * `wingUp` is the raised-wing frame of a flap, painted over the resting wing.
 * Static renders (icons, reduced motion) draw `beak` and never `beakOpen` or
 * `wingUp`. */
type RobinArt = {
  body: RobinRun[];
  beak: RobinRun[];
  beakOpen: RobinRun[];
  wingUp: RobinRun[];
  eye: RobinRun[];
  extra: RobinRun[];
};

const PALETTE: Record<string, string> = {
  B: "#7b4a2b", // head & back
  b: "#a8703f", // crown highlight
  D: "#3b2a20", // wing
  R: "#e54848", // breast (the brand accent)
  r: "#b8363a", // breast shade
  W: "#f6f3ee", // belly
  w: "#d8d2c8", // belly shade
  g: "#5b5b5b", // tail
  K: "#111111", // outline, beak, legs
  E: "#111111", // eye
  h: "#ffffff", // eye glint
  c: "#e54848", // chirp marks
  z: "#9a9a9a", // sleep marks
  q: "#e54848", // question mark
};

// cells that never grow an outline around them
const NO_OUTLINE = new Set(["K", "E", "h", "c", "z", "q"]);

const BASE = [
  "........................",
  "...........bbbb.........",
  ".........bbBBBBbb.......",
  "........bBBBBBBBBb......",
  "........BBBBBBBhEB......",
  ".......BBBBBBBBEEBKKK...",
  ".......BBBBBBBRRRRBKK...",
  "......BBBBBBRRRRRRR.....",
  ".....DDBBBBRRRRRRRRR....",
  "....DDDDBBRRRRRRRRRr....",
  "...gDDDDDRRRRRRRRRRr....",
  "..ggDDDDDRRRRRRRRRr.....",
  ".gggDDDDWWRRRRRRRRr.....",
  "ggg.DDDWWWWRRRRRRr......",
  "gg...DWWWWWWWWWWw.......",
  ".......wWWWWWWWw........",
  ".........wwwwww.........",
  "..........K...K.........",
  "..........K...K.........",
  ".........KKK.KKK........",
];

type Cell = [x: number, y: number, key: string];

const CHIRP: Cell[] = [
  [22, 2, "c"], [21, 3, "c"],
  [22, 5, "c"], [23, 5, "c"],
  [21, 7, "c"], [22, 8, "c"],
];
const QUESTION: Cell[] = [
  [20, 0, "q"], [21, 0, "q"], [22, 0, "q"],
  [23, 1, "q"], [23, 2, "q"],
  [22, 3, "q"], [21, 4, "q"],
  [21, 6, "q"],
];
// The lower beak (row 6 of BASE). Mid-chirp it swaps for BEAK_OPEN: the
// mouth shows at x19 and the lower beak drops a row, under the fixed upper beak.
const BEAK_SHUT = new Set(["19,6", "20,6"]);
const BEAK_OPEN: Cell[] = [[19, 6, "r"], [20, 7, "K"]];
const SLEEP: Cell[] = [
  [20, 1, "z"], [21, 1, "z"], [22, 1, "z"],
  [21, 2, "z"],
  [20, 3, "z"], [21, 3, "z"], [22, 3, "z"],
];

/** Letters of a small drawing → cells, its top-left at (x0, y0). */
function stamp(rows: string[], x0: number, y0: number): Cell[] {
  const cells: Cell[] = [];
  rows.forEach((row, dy) =>
    row.split("").forEach((k, dx) => {
      if (k !== ".") cells.push([x0 + dx, y0 + dy, k]);
    }),
  );
  return cells;
}

// A flap's raised wing: up and back from the shoulder, clear of the head,
// with a lighter leading edge and two feather tips on the trailing edge.
const WING_RAISED = stamp(
  [
    ".DB......",
    ".DDB.....",
    "D.DDB....",
    "..DDDB...",
    ".D.DDDB..",
    "...DDDDB.",
    ".....DD..",
  ],
  0,
  2,
);
// What the resting wing covered: the back, shading into the belly.
const WING_BED = stamp(
  [
    ".BB..",
    "BBBB.",
    "BBBBB",
    "BBBBB",
    "BBwW.",
    "Bww..",
    ".w...",
  ],
  4,
  8,
);

/** The raised-wing frame: the bed, the wing over it, and the wing's outline
 * wherever it stands out against empty space. */
function wingUpCells(): Cell[] {
  const at = (x: number, y: number) => BASE[y]?.[x] ?? ".";
  const cells = new Map<string, Cell>();
  for (const c of [...WING_BED, ...WING_RAISED]) cells.set(`${c[0]},${c[1]}`, c);
  const wing = new Set(WING_RAISED.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of WING_RAISED) {
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      const key = `${nx},${ny}`;
      if (!wing.has(key) && !cells.has(key) && at(nx, ny) === ".") cells.set(key, [nx, ny, "K"]);
    }
  }
  return [...cells.values()];
}
const WING_UP = wingUpCells();

/** Horizontal runs of one color → one rect each (keeps the SVG small). */
function runs(cells: Cell[]): RobinRun[] {
  const sorted = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const out: RobinRun[] = [];
  for (const [x, y, key] of sorted) {
    const fill = PALETTE[key]!;
    const last = out[out.length - 1];
    if (last && last.y === y && last.x + last.w === x && last.fill === fill) last.w += 1;
    else out.push({ x, y, w: 1, fill });
  }
  return out;
}

function build(mood: RobinMood): RobinArt {
  const grid = BASE.map((row) => row.split(""));
  if (mood === "sleepy") {
    grid[4]![15] = "B";
    grid[4]![16] = "B";
    grid[5]![15] = "K";
    grid[5]![16] = "K";
  }
  const H = grid.length;
  const W = grid[0]!.length;
  const at = (x: number, y: number) => (y >= 0 && y < H && x >= 0 && x < W ? grid[y]![x]! : ".");

  const body: Cell[] = [];
  const beak: Cell[] = [];
  const eye: Cell[] = [];
  for (let y = -1; y <= H; y++) {
    for (let x = -1; x <= W; x++) {
      const k = at(x, y);
      if (k === "E" || k === "h") eye.push([x, y, k]);
      else if (BEAK_SHUT.has(`${x},${y}`)) beak.push([x, y, k]);
      else if (k !== ".") body.push([x, y, k]);
      else {
        const n = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
        if (n.some((v) => v !== "." && !NO_OUTLINE.has(v))) body.push([x, y, "K"]);
      }
    }
  }
  const extra = mood === "sleepy" ? SLEEP : mood === "curious" ? QUESTION : CHIRP;
  return {
    body: runs(body),
    beak: runs(beak),
    beakOpen: runs(BEAK_OPEN),
    wingUp: runs(WING_UP),
    eye: runs(eye),
    extra: runs(extra),
  };
}

export const ROBIN_ART: Record<RobinMood, RobinArt> = {
  normal: build("normal"),
  happy: build("happy"),
  curious: build("curious"),
  sleepy: build("sleepy"),
};

/** Art bounds in cells, outline included; the grid's origin sits at (-1, -1). */
export const ROBIN_W = 26;
export const ROBIN_H = 22;

/** Where the robin stands: the middle of its feet (the bottom rows of BASE),
 * as a fraction of the art's width. A turn pivots here and a ground shadow
 * centres here, so both stay under the bird whichever way it faces. */
export const ROBIN_FEET_X = (() => {
  const xs = BASE.slice(-3).flatMap((row) => [...row].flatMap((k, x) => (k === "K" ? [x] : [])));
  return ((Math.min(...xs) + Math.max(...xs) + 1) / 2 + 1) / ROBIN_W; // +1: the grid starts at -1
})();

/** Standalone SVG markup of the robin, `scale` px per cell, centered on a
 * `size`×`size` canvas with an optional background. */
export function robinSvg({
  size,
  scale,
  background,
  mood = "normal",
}: {
  size: number;
  scale: number;
  background?: string;
  mood?: RobinMood;
}): string {
  const art = ROBIN_ART[mood];
  const ox = Math.round((size - ROBIN_W * scale) / 2) + scale; // +1 cell: origin at (-1,-1)
  const oy = Math.round((size - ROBIN_H * scale) / 2) + scale;
  const rects = [...art.body, ...art.beak, ...art.eye, ...art.extra]
    .map(
      (r) =>
        `<rect x="${ox + r.x * scale}" y="${oy + r.y * scale}" width="${r.w * scale}" height="${scale}" fill="${r.fill}"/>`,
    )
    .join("");
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${bg}${rects}</svg>`;
}

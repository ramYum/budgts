// Stepped pixel frames: the one shape in the Budgts component vocabulary
// (cards, controls, chips, tiles). A rounded corner becomes a stair of 2px
// cells, and the line follows the steps, which neither `border-radius`,
// `clip-path` nor `outline` can do. So each frame is a 9-slice SVG drawn cell
// by cell and applied as a CSS `border-image`.
//
// Generated into src/app/pixel-frames.css by `node tools/generate-pixel-frames.mjs`;
// tests/unit/pixel-frames.test.ts fails if the CSS drifts from this file.

/** One cell of the pixel grid, in CSS px. */
export const CELL = 2;

/** The palette the frames paint with. Mirrors the tokens in globals.css
 * (asserted by the test), because a data-URI SVG can't read CSS variables. */
export const PALETTE = {
  ink: "#111111",
  ash: "#6e6e6e",
  silver: "#b9b9b9",
  gray: "#e6e6e6",
  paper: "#f4f4f4",
  white: "#ffffff",
  surface2: "#f0f0f0",
  signal: "#e54848",
  signalStrong: "#d63c3c",
  signalInk: "#c93434",
  signalWash: "#fdeeee",
  signalLine: "#f8d9d9",
  growth: "#18794a",
  growthWash: "#e6f2eb",
  warnWash: "#fbf0da",
} as const;

export type FrameSpec = {
  /** corner radius in cells: 1 chip · 2 control · 3 card */
  r: 1 | 2 | 3;
  /** line thickness in cells (0 = a solid shape, no line) */
  t: 0 | 1 | 2;
  /** border-box thickness in cells; keep it equal across an element's states
   * so a thicker focus line never moves the content */
  k: number;
  line: string;
  fill: string;
};

// First filled cell in each corner row, from the outer edge in.
const CORNER: Record<FrameSpec["r"], number[]> = { 1: [1, 0], 2: [2, 1, 0], 3: [3, 1, 1, 0] };

/** The frame's cells as a grid of "line" | "fill" | null, (2k+1)² cells. */
export function frameCells({ r, t, k }: Pick<FrameSpec, "r" | "t" | "k">): ("line" | "fill" | null)[][] {
  if (k <= r || k < t) throw new Error(`k (${k}) must exceed r (${r}) and cover t (${t})`);
  const first = CORNER[r];
  const n = 2 * k + 1;
  const fold = (v: number) => (v < k ? v : v > n - 1 - k ? n - 1 - v : k);
  const shape = Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => {
      const cy = fold(y);
      return cy >= first.length || fold(x) >= first[cy]!;
    }),
  );
  // The line is the shape minus t erosions (4-neighbour), which keeps the
  // steps at any thickness.
  let core = shape;
  for (let i = 0; i < t; i++) {
    const m = core;
    core = m.map((row, y) =>
      row.map((v, x) =>
        v && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => m[y + dy!]?.[x + dx!] === true),
      ),
    );
  }
  const cells = shape.map((row, y) => row.map((v, x) => (v ? (core[y]![x] ? "fill" : "line") : null)));
  // The middle row and column are what border-image stretches along each
  // edge, so they must be a plain straight edge: t cells of line, then fill.
  // If a corner's steps reached them, the edges would repeat part of a step.
  const straight = (i: number) => (i < t || i > n - 1 - t ? "line" : "fill");
  for (let i = 0; i < n; i++) {
    if (cells[i]![k] !== straight(i) || cells[k]![i] !== straight(i)) {
      throw new Error(`r ${r}, t ${t}: the corner reaches the edge's middle cell; raise k (${k})`);
    }
  }
  return cells;
}

/** The 9-slice source: one path per colour, a run of cells per row segment. */
export function frameSvg(spec: FrameSpec): string {
  const cells = frameCells(spec);
  const runs: Record<"line" | "fill", string[]> = { line: [], fill: [] };
  cells.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const kind = row[x];
      let end = x;
      while (end < row.length && row[end] === kind) end++;
      if (kind) runs[kind].push(`M${x * CELL} ${y * CELL}h${(end - x) * CELL}v${CELL}h-${(end - x) * CELL}z`);
      x = end;
    }
  });
  const size = cells.length * CELL;
  const paths = (["fill", "line"] as const)
    .filter((kind) => runs[kind].length)
    .map((kind) => `<path fill="${kind === "line" ? spec.line : spec.fill}" d="${runs[kind].join("")}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="crispEdges">${paths}</svg>`;
}

/** The declaration that draws a frame: the 9-slice image over the border box. */
export function frameDeclaration(spec: FrameSpec): string {
  const b = spec.k * CELL;
  const svg = frameSvg(spec).replace(/"/g, "'");
  const uri = `data:image/svg+xml,${svg.replace(/[<>#%{}]/g, (c) => encodeURIComponent(c))}`;
  return `border-image: url("${uri}") ${b} fill / ${b}px / 0 stretch;`;
}

const P = PALETTE;
type Maker = (line: string, fill: string, t?: 0 | 1 | 2) => FrameSpec;
const card: Maker = (line, fill, t = 1) => ({ r: 3, t, k: 4, line, fill });
const control: Maker = (line, fill, t = 1) => ({ r: 2, t, k: 3, line, fill });
const chip: Maker = (line, fill, t = 1) => ({ r: 1, t, k: 2, line, fill });
const solid = (make: Maker, color: string) => make(color, color, 0);

/**
 * Every frame: a class, its border width in cells, and its states. A state is
 * a selector suffix (appended to the class) and the frame it draws. The width
 * is set once per class, so every state keeps the same box.
 */
export const FRAMES: { name: string; k: number; states: [string, FrameSpec][] }[] = [
  // Cards: white sheets, hairline frame. Clickable ones darken on hover and
  // thicken to ink on keyboard focus.
  {
    name: "px-card",
    k: 4,
    states: [
      ["", card(P.gray, P.white)],
      [":is(a, button):hover", card(P.silver, P.white)],
      [":is(a, button):focus-visible", card(P.ink, P.white, 2)],
    ],
  },
  // The one number on a screen: an ink frame.
  {
    name: "px-card-ink",
    k: 4,
    states: [
      ["", card(P.ink, P.white)],
      [":is(a, button):focus-visible", card(P.ink, P.white, 2)],
    ],
  },
  // An empty slot inviting a new item (a new goal).
  {
    name: "px-card-quiet",
    k: 4,
    states: [
      ["", card(P.silver, P.paper)],
      [":is(a, button):hover", card(P.ink, P.paper)],
      [":is(a, button):focus-visible", card(P.ink, P.paper, 2)],
    ],
  },
  // A suggestion ("What can I change?"): the accent's wash, no line.
  {
    name: "px-wash",
    k: 4,
    states: [
      ["", solid(card, P.signalWash)],
      [":is(a, button):hover", card(P.signalLine, P.signalWash)],
      [":is(a, button):focus-visible", card(P.ink, P.signalWash, 2)],
    ],
  },
  // Inputs and selects (the frame sits on a wrapper, so it follows focus inside).
  {
    name: "px-field",
    k: 3,
    states: [
      ["", control(P.silver, P.white)],
      [":hover", control(P.ash, P.white)],
      [":focus-within", control(P.ink, P.white, 2)],
      ["[data-invalid='true']", control(P.signalInk, P.white, 2)],
    ],
  },
  // The search field: a stronger line, it leads its screen.
  {
    name: "px-search",
    k: 3,
    states: [
      ["", control(P.ash, P.white)],
      [":focus-within", control(P.ink, P.white, 2)],
    ],
  },
  // Secondary button: ink line on white.
  {
    name: "px-btn",
    k: 3,
    states: [
      ["", control(P.ink, P.white)],
      [":hover", control(P.ink, P.paper)],
      [":focus-visible", control(P.ink, P.white, 2)],
      [":disabled", control(P.silver, P.white)],
    ],
  },
  // Destructive secondary: red line on white.
  {
    name: "px-btn-danger",
    k: 3,
    states: [
      ["", control(P.signalInk, P.white)],
      [":hover", control(P.signalInk, P.signalWash)],
      [":focus-visible", control(P.signalInk, P.white, 2)],
      [":disabled", control(P.silver, P.white)],
    ],
  },
  // Primary button: solid red (its raised edge is a drop-shadow, globals.css).
  {
    name: "px-btn-primary",
    k: 3,
    states: [
      ["", solid(control, P.signalStrong)],
      [":hover", solid(control, P.signalInk)],
      [":focus-visible", control(P.ink, P.signalStrong)],
      [":disabled", solid(control, P.silver)],
    ],
  },
  // Square step buttons (month back/forward, the back arrow, row menus).
  {
    name: "px-step",
    k: 3,
    states: [
      ["", control(P.silver, P.white)],
      [":hover", control(P.ink, P.white)],
      [":focus-visible", control(P.ink, P.white, 2)],
      ["[aria-disabled='true']", control(P.gray, P.paper)],
    ],
  },
  // Icon tiles.
  { name: "px-tile", k: 3, states: [["", solid(control, P.surface2)]] },
  { name: "px-tile-wash", k: 3, states: [["", solid(control, P.signalWash)]] },
  { name: "px-tile-accent", k: 3, states: [["", solid(control, P.signalStrong)]] },
  { name: "px-tile-ink", k: 3, states: [["", solid(control, P.ink)]] },
  { name: "px-tile-growth", k: 3, states: [["", solid(control, P.growthWash)]] },
  // A warning notice (amber wash) and a quiet note band inside a card.
  { name: "px-warn", k: 3, states: [["", solid(control, P.warnWash)]] },
  { name: "px-band", k: 3, states: [["", solid(control, P.surface2)]] },
  // Sidebar rows: nothing until hover; the current page keeps the fill.
  {
    name: "px-nav",
    k: 3,
    states: [
      [":hover", solid(control, P.surface2)],
      ["[aria-current='page']", solid(control, P.surface2)],
      [":focus-visible", control(P.ink, P.surface2, 2)],
    ],
  },
  // Filter chips and segmented controls.
  {
    name: "px-chip",
    k: 2,
    states: [
      ["", chip(P.silver, P.white)],
      [":hover", chip(P.ink, P.white)],
      ["[aria-pressed='true']", solid(chip, P.ink)],
      [":focus-visible", chip(P.ink, P.white, 2)],
      ["[aria-pressed='true']:focus-visible", chip(P.signal, P.ink)],
    ],
  },
  // Status badges.
  { name: "px-badge", k: 2, states: [["", solid(chip, P.surface2)]] },
  { name: "px-badge-growth", k: 2, states: [["", solid(chip, P.growthWash)]] },
  { name: "px-badge-wash", k: 2, states: [["", solid(chip, P.signalWash)]] },
  { name: "px-badge-ink", k: 2, states: [["", solid(chip, P.ink)]] },
  { name: "px-badge-accent", k: 2, states: [["", solid(chip, P.signalStrong)]] },
  // Checkboxes and switches.
  {
    name: "px-check",
    k: 2,
    states: [
      ["", chip(P.silver, P.white)],
      ["[data-state='done']", solid(chip, P.growth)],
      ["[data-state='working']", solid(chip, P.ink)],
    ],
  },
  {
    name: "px-switch",
    k: 2,
    states: [
      ["", chip(P.ash, P.white)],
      ["[aria-checked='true']", solid(chip, P.ink)],
      [":focus-visible", chip(P.signal, P.white, 2)],
      ["[aria-checked='true']:focus-visible", chip(P.signal, P.ink)],
      [":disabled", chip(P.silver, P.paper)],
    ],
  },
];

/** The whole stylesheet (what tools/generate-pixel-frames.mjs writes). */
export function framesCss(): string {
  const out = [
    "/* GENERATED by tools/generate-pixel-frames.mjs from src/lib/brand/pixel-frame.ts.",
    " * Do not edit by hand: change the frame table there and regenerate.",
    " * In the components layer, so a utility class can still adjust a framed box. */",
    "@layer components {",
  ];
  for (const { name, k, states } of FRAMES) {
    for (const [suffix, spec] of states) {
      if (spec.k !== k) throw new Error(`${name}${suffix}: every state must keep k = ${k}`);
    }
    out.push(`.${name} {\n  border: ${k * CELL}px solid transparent;\n  background: none;\n}`);
    for (const [suffix, spec] of states) {
      // A square outline around a stepped frame reads as a double border;
      // focus thickens the frame's own line instead.
      const focus = suffix.includes("focus") ? "\n  outline: none;" : "";
      out.push(`.${name}${suffix} {\n  ${frameDeclaration(spec)}${focus}\n}`);
    }
  }
  out.push("}");
  return `${out.join("\n")}\n`;
}

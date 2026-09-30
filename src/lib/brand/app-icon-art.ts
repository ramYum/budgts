/** The native apps' launcher icon: the approved sign-in badge (Crystal on her
 * card of progress cells, on a paper disc with grid-paper dots and two
 * sparkles, ringed in ink) with the ink flooded out to the tile's edge, so the
 * icon holds its own on light and dark wallpapers. tools/generate-app-icons.mjs
 * renders it; docs/BRAND_GUIDELINES.md → Logo & mascot.
 *
 * One pixel grain: everything sits on one ICON_GRID-cell square grid, Crystal
 * included, drawn from robin-art.ts unchanged. The design is split in layers
 * for Android's adaptive icon: `ground` (every cell of the full-bleed
 * background, any coordinate, so it can bleed past the grid), `back` (the
 * details on it) and `front` (Crystal and her progress cells, which stay in
 * the foreground layer).
 *
 * Pure data + pure functions; imports only other shared brand modules
 * (tests/unit/brand-purity.test.ts). */

import { ROBIN_ART } from "./robin-art.ts";

/** Cells a side of the icon's design. */
export const ICON_GRID = 44;

export type IconCell = [x: number, y: number, fill: string];

const INK = "#111111";
const PAPER = "#f4f4f4";
const WHITE = "#ffffff";
const GRAY = "#e6e6e6"; // --gray: grid dots, the card's edge, the unlit cell
const SILVER = "#b9b9b9"; // --silver: the sparkles

const MID = ICON_GRID / 2;
/** The paper disc's radius, in cells: the badge, 2.5 cells of ink from each side. */
export const ICON_DISC_RADIUS = 19.5;

/** The full-bleed ground at any cell: paper with grid-paper dots inside the disc, ink outside it. */
export function iconGround(x: number, y: number): string {
  if ((x + 0.5 - MID) ** 2 + (y + 0.5 - MID) ** 2 > ICON_DISC_RADIUS ** 2) return INK;
  const onDot = (((x - 1) % 3) + 3) % 3 === 0 && (((y - 1) % 3) + 3) % 3 === 0;
  return onDot ? GRAY : PAPER;
}

type Layer = Map<string, IconCell>;
const put = (layer: Layer, x: number, y: number, fill: string) => layer.set(`${x},${y}`, [x, y, fill]);
const rect = (layer: Layer, x: number, y: number, w: number, h: number, fill: string) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(layer, x + i, y + j, fill);
};
const sparkle = (layer: Layer, x: number, y: number) => {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) put(layer, x + dx, y + dy, SILVER);
};

/** Crystal's cells from robin-art.ts, her art box's top-left at (0, 0). */
export const ICON_ROBIN: IconCell[] = (() => {
  const art = ROBIN_ART.normal;
  const cells: IconCell[] = [];
  for (const r of [...art.body, ...art.beak, ...art.eye, ...art.extra]) for (let i = 0; i < r.w; i++) cells.push([r.x + 1 + i, r.y + 1, r.fill]);
  return cells;
})();

/** Where the card sits and where Crystal's art box starts. */
export const ICON_CARD = { x: MID - 12, y: 29, w: 24, h: 8 } as const;
export const ICON_ROBIN_AT: [x: number, y: number] = (() => {
  const right = Math.max(...ICON_ROBIN.map((c) => c[0]));
  const bottom = Math.max(...ICON_ROBIN.map((c) => c[1]));
  // centred on the card, her feet on its top edge
  return [Math.round(MID - (right + 1) / 2), ICON_CARD.y - 1 - bottom];
})();

export const ICON_LAYERS: { back: IconCell[]; front: IconCell[]; robin: IconCell[] } = (() => {
  const back: Layer = new Map();
  const front: Layer = new Map();
  const { x, y, w, h } = ICON_CARD;
  // the white card, 1-cell stepped corners, a gray edge below (the badge's)
  rect(back, x, y, w, h, WHITE);
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]] as const) back.delete(`${cx},${cy}`);
  rect(back, x + 1, y + h, w - 2, 1, GRAY);
  // five progress cells, four lit: on track
  for (let i = 0; i < 5; i++) rect(front, x + 5 + i * 3, y + 3, 2, 2, i < 4 ? INK : GRAY);
  sparkle(back, 9, 14);
  sparkle(back, 35, 22);
  put(back, 13, 10, SILVER); // on a dot's place, so it reads as a brighter dot
  const [ax, ay] = ICON_ROBIN_AT;
  const robin: IconCell[] = ICON_ROBIN.map(([cx, cy, fill]) => [ax + cx, ay + cy, fill]);
  for (const [cx, cy, fill] of robin) put(front, cx, cy, fill);
  // A clear cell of paper around every mark (Crystal, the card, the sparkles),
  // so no grid dot ever touches one: each reads as its own crisp shape.
  const marks = [...back.values(), ...front.values()];
  const taken = new Set(marks.map(([mx, my]) => `${mx},${my}`));
  for (const [mx, my] of marks)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${mx + dx},${my + dy}`;
        if (!taken.has(k) && iconGround(mx + dx, my + dy) === GRAY) put(back, mx + dx, my + dy, PAPER);
      }
  return { back: [...back.values()], front: [...front.values()], robin };
})();

/** "robin" is Crystal alone (part of "front"): the themed icon's source. */
export type IconPart = "ground" | "back" | "front" | "robin";

/**
 * SVG markup of the icon on a `size`×`size` canvas at `scale` px per cell, the
 * design centred. `parts` picks the layers; without "ground" the canvas is
 * transparent. `only` keeps just the cells whose fill it accepts (the themed
 * icon), recoloured to `recolor`.
 */
export function appIconSvg({
  size,
  scale,
  parts = ["ground", "back", "front"],
  only,
  recolor,
}: {
  size: number;
  scale: number;
  parts?: IconPart[];
  only?: (fill: string) => boolean;
  recolor?: string;
}): string {
  const o = Math.round((size - ICON_GRID * scale) / 2);
  const cell = (x: number, y: number, fill: string) => {
    if (only && !only(fill)) return "";
    return `<rect x="${o + x * scale}" y="${o + y * scale}" width="${scale}" height="${scale}" fill="${recolor ?? fill}"/>`;
  };
  let body = "";
  if (parts.includes("ground")) {
    body += `<rect width="${size}" height="${size}" fill="${INK}"/>`;
    const from = Math.floor(-o / scale) - 1;
    const to = Math.ceil((size - o) / scale) + 1;
    for (let y = from; y <= to; y++) for (let x = from; x <= to; x++) {
      const fill = iconGround(x, y);
      if (fill !== INK) body += cell(x, y, fill);
    }
  }
  if (parts.includes("back")) for (const [x, y, fill] of ICON_LAYERS.back) body += cell(x, y, fill);
  if (parts.includes("front")) for (const [x, y, fill] of ICON_LAYERS.front) body += cell(x, y, fill);
  else if (parts.includes("robin")) for (const [x, y, fill] of ICON_LAYERS.robin) body += cell(x, y, fill);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${body}</svg>`;
}

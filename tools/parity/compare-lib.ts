/**
 * The parity check's pure parts (tested in tests/unit/parity/compare.test.ts): geometry within 1 pt, exact token colours
 * and the crop both images share. compare.ts wires them to files, pixelmatch and the HTML report.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type KeyedBox = Rect & { key: string };

export const GEOMETRY_TOLERANCE = 1; // pt (CSS px = dp)

export type GeometryRow = {
  key: string;
  a: Rect | null;
  b: Rect | null;
  /** largest |Δ| of x, y, w, h; null when one side lacks the id */
  delta: number | null;
  ok: boolean;
};

/** Boxes relative to their screen root, keyed (`id`, `id#2`, …). Boxes wholly outside the root are dropped. */
export function relativeBoxes(boxes: KeyedBox[], root: Rect): KeyedBox[] {
  return boxes
    .map((b) => ({ ...b, x: b.x - root.x, y: b.y - root.y }))
    .filter((b) => b.y < root.h && b.y + b.h > 0 && b.x < root.w && b.x + b.w > 0);
}

/**
 * Every id on either side, matched by key. An id present on one side only is a failure (the plan's rule: a missing id is
 * a missing element, or a missing test id, and both block the screen).
 */
export function compareGeometry(a: KeyedBox[], b: KeyedBox[], tolerance = GEOMETRY_TOLERANCE): GeometryRow[] {
  const byKey = (list: KeyedBox[]) => new Map(list.map((x) => [x.key, x] as const));
  const A = byKey(a);
  const B = byKey(b);
  const keys = [...new Set([...A.keys(), ...B.keys()])];
  return keys.map((key) => {
    const ra = A.get(key) ?? null;
    const rb = B.get(key) ?? null;
    if (!ra || !rb) return { key, a: ra, b: rb, delta: null, ok: false };
    const delta = Math.max(Math.abs(ra.x - rb.x), Math.abs(ra.y - rb.y), Math.abs(ra.w - rb.w), Math.abs(ra.h - rb.h));
    return { key, a: ra, b: rb, delta, ok: delta <= tolerance };
  });
}

/** `#rrggbb` of the pixel at (px, py); null outside the image. */
export function pixelHex(png: { width: number; height: number; data: Uint8Array }, px: number, py: number): string | null {
  const x = Math.round(px);
  const y = Math.round(py);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
  const i = (png.width * y + x) * 4;
  return `#${[png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The pixel rect of a logical rect at `scale`, clamped to the image. */
export function toPixels(r: Rect, scale: number, width: number, height: number): Rect {
  const x = Math.max(0, Math.round(r.x * scale));
  const y = Math.max(0, Math.round(r.y * scale));
  return {
    x,
    y,
    w: Math.max(0, Math.min(width - x, Math.round(r.w * scale))),
    h: Math.max(0, Math.min(height - y, Math.round(r.h * scale))),
  };
}

/** Copies a pixel rect out of an RGBA buffer. */
export function cropRgba(src: { width: number; data: Uint8Array | Buffer }, r: Rect): Uint8Array {
  const out = new Uint8Array(r.w * r.h * 4);
  for (let row = 0; row < r.h; row++) {
    const from = ((r.y + row) * src.width + r.x) * 4;
    out.set(src.data.subarray(from, from + r.w * 4), row * r.w * 4);
  }
  return out;
}

/** The area both crops share, anchored top-left (the AVD is 411.43 dp wide against the web's 412 CSS px). */
export function sharedSize(a: Rect, b: Rect): { w: number; h: number; lost: number } {
  const w = Math.min(a.w, b.w);
  const h = Math.min(a.h, b.h);
  return { w, h, lost: Math.max(a.w * a.h, b.w * b.h) - w * h };
}

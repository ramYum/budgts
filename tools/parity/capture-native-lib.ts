/**
 * The native capture's pure parts (tests/unit/parity/capture-native.test.ts): reading Maestro's view hierarchy into the
 * same keyed boxes the web capture writes, in dp relative to the image, and reading the device density.
 */
import type { Box } from "./capture-web";

type Node = { attributes?: Record<string, string | undefined>; children?: Node[] };

/** `[x1,y1][x2,y2]` (Android bounds, px) → rect, or null. */
export function parseBounds(bounds: string | undefined): { x: number; y: number; w: number; h: number } | null {
  const m = bounds?.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/);
  if (!m) return null;
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** A view's test id: RN's `testID` is the Android resource-id (a `package:id/` prefix, if any, dropped). */
function testIdOf(attrs: Record<string, string | undefined>): string | null {
  const raw = attrs["resource-id"] ?? attrs.resourceId ?? attrs.testID;
  if (!raw) return null;
  const id = raw.includes(":id/") ? raw.slice(raw.indexOf(":id/") + 4) : raw;
  return id || null;
}

/**
 * Every view with a test id, depth-first in tree order (the web's document order), numbered like the web capture
 * (`progress-bar#2`), in dp (`px / density`). Zero-size views are skipped, as the web skips hidden elements.
 */
export function boxesFromHierarchy(json: string, density: number): Box[] {
  const start = json.indexOf("{");
  if (start < 0) throw new Error("parity: maestro hierarchy printed no JSON");
  const root = JSON.parse(json.slice(start)) as Node;
  const seen = new Map<string, number>();
  const out: Box[] = [];
  const walk = (n: Node) => {
    const attrs = n.attributes ?? {};
    const id = testIdOf(attrs);
    const r = parseBounds(attrs.bounds);
    if (id && r && r.w > 0 && r.h > 0) {
      const k = (seen.get(id) ?? 0) + 1;
      seen.set(id, k);
      out.push({ id, key: k === 1 ? id : `${id}#${k}`, x: r.x / density, y: r.y / density, w: r.w / density, h: r.h / density });
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

/** `adb shell wm density` → the density factor (420 dpi → 2.625). An override wins over the physical value. */
export function parseDensity(output: string): number {
  const override = output.match(/Override density:\s*(\d+)/);
  const physical = output.match(/Physical density:\s*(\d+)/);
  const dpi = Number((override ?? physical)?.[1]);
  if (!dpi) throw new Error(`parity: could not read the device density from "${output.trim()}"`);
  return dpi / 160;
}

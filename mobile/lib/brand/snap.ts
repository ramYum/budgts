/**
 * Crisp pixel art on any screen density. The web draws the brand's art with
 * `shape-rendering: crispEdges`, which fills a device pixel only when its
 * centre is inside a shape: every edge lands on the nearest whole device
 * pixel. react-native-svg has no crispEdges and always anti-aliases, so a
 * cell edge between device pixels (a 2px cell is 5.25 device px at 2.625x)
 * would blur. Snapping every edge to the device-pixel grid first gives the
 * same pixels the web paints, with nothing left for anti-aliasing to soften.
 *
 * The art is rectilinear (frames, the robin's runs, Pixelarticons), so a
 * path is a list of corner points, each mapped and snapped on its own.
 */

/**
 * A length in px, on the nearest device pixel at `ratio` device px per px.
 * Halves round down, as a pixel whose centre sits exactly on an edge is
 * painted only on the shape's top-left side (the rasteriser's tie rule).
 */
export function snap(v: number, ratio: number): number {
  return Math.ceil(v * ratio - 0.5 - 1e-9) / ratio;
}

type Point = [number, number];

/** The corner points of a rectilinear path (M/m, H/h, V/v, L/l, Z/z), in absolute units, one list per subpath. */
export function pathPoints(d: string): Point[][] {
  const tokens = d.match(/[MmHhVvLlZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const shapes: Point[][] = [];
  let current: Point[] | null = null;
  let x = 0;
  let y = 0;
  let start: Point = [0, 0];
  let command = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) command = tokens[i++]!;
    switch (command) {
      case "M":
      case "m": {
        const nx = num();
        const ny = num();
        x = command === "m" ? x + nx : nx;
        y = command === "m" ? y + ny : ny;
        start = [x, y];
        current = [[x, y]];
        shapes.push(current);
        command = command === "m" ? "l" : "L"; // further pairs are lines
        break;
      }
      case "L":
      case "l": {
        const nx = num();
        const ny = num();
        x = command === "l" ? x + nx : nx;
        y = command === "l" ? y + ny : ny;
        current!.push([x, y]);
        break;
      }
      case "H":
      case "h":
        x = command === "h" ? x + num() : num();
        current!.push([x, y]);
        break;
      case "V":
      case "v":
        y = command === "v" ? y + num() : num();
        current!.push([x, y]);
        break;
      case "Z":
      case "z":
        [x, y] = start;
        current = null;
        break;
      default:
        throw new Error(`unsupported path command "${command}" in pixel art`);
    }
  }
  return shapes;
}

/**
 * The path in px, `unit` px per path unit from (`dx`, `dy`), every corner on
 * the device-pixel grid.
 */
export function snapPath(d: string, { unit, dx = 0, dy = 0, ratio }: { unit: number; dx?: number; dy?: number; ratio: number }): string {
  return pathPoints(d)
    .map((shape) => shape.map(([px, py], j) => `${j ? "L" : "M"}${snap(dx + px * unit, ratio)} ${snap(dy + py * unit, ratio)}`).join("") + "Z")
    .join("");
}

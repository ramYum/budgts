import { ROBIN_ART, ROBIN_H, ROBIN_W, type RobinMood, type RobinRun } from "@/lib/brand/robin-art";

/** The Budgts robin, drawn as pixel art (src/lib/brand/robin-art.ts).
 *
 * Pure SVG, so it renders on the server and scales crisply at any size
 * (shape-rendering: crispEdges). CSS brings it to life (globals.css
 * `robin-*`): the eye blinks, and a normal/happy robin chirps (the beak opens
 * twice while the chirp marks sound) every `--robin-chirp`. The mascot hops on
 * hover. Moods swap a few cells: `sleepy` closes the eye and trades the chirp
 * for a flickering "z", `curious` trades it for a "?". */

const ROBIN_ASPECT = ROBIN_W / ROBIN_H;

const pathsByLayer = new WeakMap<RobinRun[], [fill: string, d: string][]>();

/** One layer of the art as a path per colour, each run a one-cell-tall
 * rectangle in it. Runs never overlap within a layer (robin-art.test.ts), so
 * this paints exactly what a <rect> per run did, in about 20 elements a
 * robin instead of 170: a lighter page and less for React to hydrate. */
function Runs({ list }: { list: RobinRun[] }) {
  let paths = pathsByLayer.get(list);
  if (!paths) {
    const byFill = new Map<string, string>();
    for (const r of list) byFill.set(r.fill, `${byFill.get(r.fill) ?? ""}M${r.x} ${r.y}h${r.w}v1h-${r.w}z`);
    paths = [...byFill];
    pathsByLayer.set(list, paths);
  }
  return (
    <>
      {paths.map(([fill, d]) => (
        <path key={fill} d={d} fill={fill} />
      ))}
    </>
  );
}

/** Bare robin art. `size` is the rendered height in px. `flaps` adds the
 * raised-wing frame (hidden at rest) for a parent's choreography to flap:
 * Crystal on Home (globals.css `crystal-*`). */
export function Robin({
  mood = "normal",
  size = 56,
  animated = true,
  flaps = false,
  className,
  title,
}: {
  mood?: RobinMood;
  size?: number;
  animated?: boolean;
  flaps?: boolean;
  className?: string;
  title?: string;
}) {
  const art = ROBIN_ART[mood];
  const chirps = animated && (mood === "normal" || mood === "happy");
  return (
    <svg
      viewBox={`-1 -1 ${ROBIN_W} ${ROBIN_H}`}
      width={Math.round(size * ROBIN_ASPECT)}
      height={size}
      shapeRendering="crispEdges"
      className={`inline-block shrink-0 ${className ?? ""}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <Runs list={art.body} />
      <g className={chirps ? "robin-beak" : undefined}>
        <Runs list={art.beak} />
      </g>
      {chirps ? (
        <g className="robin-beak-open">
          <Runs list={art.beakOpen} />
        </g>
      ) : null}
      {animated && flaps ? (
        <g className="robin-wing-up">
          <Runs list={art.wingUp} />
        </g>
      ) : null}
      <g className={animated && mood !== "sleepy" ? "robin-eye" : undefined}>
        <Runs list={art.eye} />
      </g>
      <g className={chirps ? "robin-chirp" : animated ? "robin-flicker" : undefined}>
        <Runs list={art.extra} />
      </g>
    </svg>
  );
}

/** The robin as a mascot beside copy: empty states, greetings, nudges.
 * `size` is the rendered width in px. */
export function Mascot({
  mood = "normal",
  size = 56,
  className,
}: {
  mood?: RobinMood;
  size?: number;
  className?: string;
}) {
  return <Robin mood={mood} size={Math.round(size / ROBIN_ASPECT)} className={`robin-hop ${className ?? ""}`} />;
}

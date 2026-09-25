import { ROBIN_ART, ROBIN_H, ROBIN_W, type RobinMood, type RobinRun } from "@/lib/brand/robin-art";

/** The Budgts robin, drawn as pixel art (src/lib/brand/robin-art.ts).
 *
 * Pure SVG, so it renders on the server and scales crisply at any size
 * (shape-rendering: crispEdges). CSS brings it to life: the eye blinks and
 * the chirp marks flicker (globals.css `robin-*`), and the mascot hops on
 * hover. Moods swap a few cells: `sleepy` closes the eye and trades the chirp
 * for "z", `curious` trades it for a "?". */

const ROBIN_ASPECT = ROBIN_W / ROBIN_H;

function Rects({ list }: { list: RobinRun[] }) {
  return (
    <>
      {list.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </>
  );
}

/** Bare robin art. `size` is the rendered height in px. */
export function Robin({
  mood = "normal",
  size = 56,
  animated = true,
  className,
  title,
}: {
  mood?: RobinMood;
  size?: number;
  animated?: boolean;
  className?: string;
  title?: string;
}) {
  const art = ROBIN_ART[mood];
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
      <Rects list={art.body} />
      <g className={animated && mood !== "sleepy" ? "robin-eye" : undefined}>
        <Rects list={art.eye} />
      </g>
      <g className={animated ? "robin-chirp" : undefined}>
        <Rects list={art.extra} />
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

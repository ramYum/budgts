/** The brand's black-cat mascot — the real Logo Assets artwork (see
 * docs/BRAND_GUIDELINES.md). Used to add a little encouragement to empty
 * states — per the brand voice: kind, encouraging, human. */

// Each mood's actual pixel size (public/brand/mood-*.png) — passed as the
// width/height attributes so the browser's placeholder aspect-ratio (used
// before the image loads) matches the real art instead of a mismatched
// square, which could otherwise show as the wrong edge getting clipped.
const MOOD = {
  normal: { src: "/brand/mood-normal.png", w: 126, h: 92 },
  happy: { src: "/brand/mood-happy.png", w: 131, h: 94 },
  curious: { src: "/brand/mood-curious.png", w: 124, h: 117 },
  sleepy: { src: "/brand/mood-sleepy.png", w: 125, h: 111 },
} as const;

export function Mascot({
  mood = "normal",
  size = 56,
  className,
}: {
  mood?: keyof typeof MOOD;
  size?: number;
  className?: string;
}) {
  const { src, w, h } = MOOD[mood];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, decorative
    <img
      src={src}
      alt=""
      width={w}
      height={h}
      className={className}
      style={{ width: size, height: "auto" }}
    />
  );
}

/** The brand's robin mascot — the real Logo Assets V2 artwork (see
 * docs/BRAND_GUIDELINES.md). Used to add a little encouragement to empty
 * states — per the brand voice: kind, encouraging, human. */

// Each mood's actual pixel size (public/brand/mood-*.png) — passed as the
// width/height attributes so the browser's placeholder aspect-ratio (used
// before the image loads) matches the real art instead of a mismatched
// square, which could otherwise show as the wrong edge getting clipped.
const MOOD = {
  normal: { src: "/brand/mood-normal.png", w: 163, h: 244 },
  // "Happy" is the logo mark itself (docs/BRAND_GUIDELINES.md) — one file.
  happy: { src: "/brand/logo-mark.png", w: 306, h: 288 },
  curious: { src: "/brand/mood-curious.png", w: 251, h: 315 },
  sleepy: { src: "/brand/mood-sleepy.png", w: 230, h: 242 },
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

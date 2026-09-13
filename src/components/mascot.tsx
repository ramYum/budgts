/** The brand's black-cat mascot, cropped from the brand asset sheet
 * ("New Assets.svg"). Used to add a little encouragement to empty states —
 * per the brand voice: kind, encouraging, human. */

const MOOD_SRC = {
  normal: "/brand/mood-normal.png",
  happy: "/brand/mood-happy.png",
  curious: "/brand/mood-curious.png",
  sleepy: "/brand/mood-sleepy.png",
} as const;

export function Mascot({
  mood = "normal",
  size = 56,
  className,
}: {
  mood?: keyof typeof MOOD_SRC;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, decorative
    <img
      src={MOOD_SRC[mood]}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: "auto" }}
    />
  );
}

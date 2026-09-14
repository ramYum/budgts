/** Soft brand-color blobs scattered across the otherwise-empty page margins
 * on each main tab — decoration for dull cream space, never meant to sit
 * under readable text or behind a card (cards have an opaque `--surface`
 * fill, so a blob positioned behind one is simply invisible there — the
 * scatter is self-clipping to genuinely empty space by construction).
 * Fixed to the viewport so it reads as background texture while the page
 * scrolls past it, like the decorative shapes on the marketing pages.
 * See docs/BRAND_GUIDELINES.md "Decorative shapes". Purely presentational —
 * `aria-hidden`, no interaction. */

type Pos = { top?: string; bottom?: string; left?: string; right?: string };

type Blob = {
  shape: string;
  size: number;
  color: string;
} & Pos;

// A handful of distinct organic (asymmetric, rounded) outlines and a small/
// medium/large size spread — mixed per tab below so the scatter reads as
// varied rather than one repeated stamp.
const SHAPES = {
  a: "63% 37% 54% 46% / 48% 44% 56% 52%",
  b: "42% 58% 65% 35% / 55% 40% 60% 45%",
  c: "55% 45% 40% 60% / 60% 42% 58% 40%",
  d: "38% 62% 55% 45% / 45% 58% 42% 55%",
  e: "60% 40% 45% 55% / 40% 62% 38% 60%",
} as const;

const SIZE = { sm: 72, md: 132, lg: 212 } as const;

const VARIANTS = {
  home: [
    { shape: SHAPES.a, size: SIZE.lg, color: "var(--sun-tint)", top: "-3rem", right: "-4rem" },
    { shape: SHAPES.c, size: SIZE.sm, color: "var(--lavender)", top: "1rem", left: "-1.5rem" },
    { shape: SHAPES.b, size: SIZE.md, color: "var(--pink)", top: "40%", right: "-3.5rem" },
    { shape: SHAPES.d, size: SIZE.sm, color: "var(--sky)", bottom: "18%", left: "-2rem" },
    { shape: SHAPES.e, size: SIZE.md, color: "var(--sage)", bottom: "-3rem", right: "8%" },
  ],
  budgets: [
    { shape: SHAPES.c, size: SIZE.lg, color: "var(--coral-tint)", top: "-3rem", left: "-4rem" },
    { shape: SHAPES.a, size: SIZE.sm, color: "var(--sky)", top: "2rem", right: "-1.5rem" },
    { shape: SHAPES.e, size: SIZE.md, color: "var(--lavender)", top: "42%", left: "-3.5rem" },
    { shape: SHAPES.b, size: SIZE.sm, color: "var(--sage)", bottom: "20%", right: "-2rem" },
    { shape: SHAPES.d, size: SIZE.md, color: "var(--sun-tint)", bottom: "-2.5rem", left: "10%" },
  ],
  activity: [
    { shape: SHAPES.b, size: SIZE.lg, color: "var(--sky)", top: "-3.5rem", right: "-3.5rem" },
    { shape: SHAPES.d, size: SIZE.sm, color: "var(--pink)", top: "3rem", left: "-1.5rem" },
    { shape: SHAPES.a, size: SIZE.md, color: "var(--sun-tint)", top: "45%", right: "-3rem" },
    { shape: SHAPES.c, size: SIZE.sm, color: "var(--lavender)", bottom: "16%", left: "-2rem" },
    { shape: SHAPES.e, size: SIZE.md, color: "var(--coral-tint)", bottom: "-2.5rem", right: "6%" },
  ],
  more: [
    { shape: SHAPES.e, size: SIZE.lg, color: "var(--lavender)", top: "-3rem", left: "-3.5rem" },
    { shape: SHAPES.b, size: SIZE.sm, color: "var(--sun-tint)", top: "2.5rem", right: "-1.5rem" },
    { shape: SHAPES.d, size: SIZE.md, color: "var(--coral-tint)", top: "40%", left: "-3rem" },
    { shape: SHAPES.a, size: SIZE.sm, color: "var(--sage)", bottom: "18%", right: "-2rem" },
    { shape: SHAPES.c, size: SIZE.md, color: "var(--sky)", bottom: "-2.5rem", left: "8%" },
  ],
} satisfies Record<string, Blob[]>;

export function TabBlobs({ variant }: { variant: keyof typeof VARIANTS }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -1 }}>
      {VARIANTS[variant].map((b, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: b.size,
            height: b.size,
            background: b.color,
            borderRadius: b.shape,
            top: b.top,
            bottom: b.bottom,
            left: b.left,
            right: b.right,
          }}
        />
      ))}
    </div>
  );
}

import { COLOR, FONT, ROLE } from "./brand/shared";

/**
 * The older screens' palette and fonts, from the shared design tokens
 * (src/lib/brand/tokens.ts, which a web test keeps equal to globals.css).
 * Phase 3 rebuilds each screen from the brand primitives (components/brand)
 * and retires this module; until then those screens read the real brand
 * colors and Geist through it, never the pre-redesign palette.
 */
export const colors = {
  bg: ROLE.bg,
  surface: ROLE.surface,
  text: ROLE.text,
  muted: ROLE.muted,
  border: ROLE.border,
  /** links, focus, spinners */
  accent: COLOR.signal,
  /** the one primary action per screen */
  primaryBtn: ROLE.primaryBtn,
  onPrimaryBtn: ROLE.onPrimaryBtn,
  neg: ROLE.neg,
  pos: ROLE.pos,
  /** the Money Left hero card: a white sheet */
  heroFill: ROLE.surface,
  /** "near budget" progress: the web paints near and over red */
  fillNear: COLOR.signal,
} as const;

/** Geist per weight: React Native never synthesises a weight for a custom font, so each weight is its own family. */
export const fonts = {
  regular: FONT.geist[400],
  medium: FONT.geist[500],
  semibold: FONT.geist[600],
  bold: FONT.geist[600],
} as const;

export const radii = {
  field: 12,
  card: 32,
  pill: 999,
} as const;

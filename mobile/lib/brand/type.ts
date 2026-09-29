import { DOGICA_WORD_SPACING_EM, FONT, SHADOW, TYPE, trackingPx, type Shadow, type TypeRole, type TypeRoleName } from "./shared";

/**
 * The type roles and shadows as React Native styles, from the shared tokens.
 * Pure (no react-native import) so it is unit-tested without a device.
 */

export type NativeTextStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: "uppercase";
  fontVariant?: ["tabular-nums"];
  /** custom fonts never get a synthesised weight: the family is the weight */
  fontWeight: "normal";
};

export function familyOf(role: TypeRole): string {
  if (role.face === "dogicaBold") return FONT.dogicaBold;
  if (role.face === "dogicaPixel") return FONT.dogicaPixel;
  if (role.face === "geistMono") return FONT.geistMono;
  return FONT.geist[role.weight ?? 400];
}

export function textStyle(name: TypeRoleName): NativeTextStyle {
  const role: TypeRole = TYPE[name];
  return {
    fontFamily: familyOf(role),
    fontSize: role.size,
    lineHeight: role.lineHeight,
    letterSpacing: round(trackingPx(role)),
    fontWeight: "normal",
    ...(role.uppercase ? { textTransform: "uppercase" as const } : {}),
    ...(role.tabular ? { fontVariant: ["tabular-nums"] as ["tabular-nums"] } : {}),
  };
}

export function isPixelRole(name: TypeRoleName): boolean {
  const face = TYPE[name].face;
  return face === "dogicaBold" || face === "dogicaPixel";
}

/**
 * Dogica's word spacing. The web trims each space by a quarter em
 * (`word-spacing: -0.25em`); React Native has no word-spacing, so a pixel
 * role's spaces are set in their own span with this letter-spacing: the
 * role's tracking plus the trim, which is what the web adds to a space.
 */
export function pixelSpaceLetterSpacing(name: TypeRoleName): number {
  const role: TypeRole = TYPE[name];
  return round(trackingPx(role) + DOGICA_WORD_SPACING_EM * role.size);
}

/** Splits text into words and runs of spaces, so the spaces can be narrowed. */
export function splitSpaces(text: string): { text: string; space: boolean }[] {
  return text.split(/( +)/).filter(Boolean).map((part) => ({ text: part, space: part.startsWith(" ") }));
}

export type NativeShadow = {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  color: string;
};

/** A shadow token as React Native `boxShadow` (New Architecture, iOS and Android). */
export function nativeShadow(list: readonly Shadow[]): NativeShadow[] {
  return list.map((s) => ({
    offsetX: s.x,
    offsetY: s.y,
    blurRadius: s.blur,
    spreadDistance: s.spread,
    color: `rgba(${s.rgb.join(", ")}, ${s.alpha})`,
  }));
}

export const SHADOWS = {
  card: nativeShadow(SHADOW.card),
  raised: nativeShadow(SHADOW.raised),
} as const;

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Budgts design tokens for native screens. The single source of truth is the
 * web app's `src/app/globals.css` (see `docs/BRAND_GUIDELINES.md`); mobile is a
 * separate npm root and cannot import it, so the values are mirrored here and
 * `theme.test.ts` fails if they drift from that file.
 */
export const colors = {
  bg: "#fff8f0", // --cream: page background
  surface: "#fffdf9", // --surface-raw: cards, fields
  text: "#0f0f0f", // --ink
  muted: "#8b8f9c",
  border: "#ece5da",
  accent: "#ff7b61", // --coral: links, focus, highlights
  primaryBtn: "#ffd166", // --sun: the one primary action per screen
  onPrimaryBtn: "#0f0f0f", // ink on sun (white on sun fails contrast)
  neg: "#ff6347", // --coral-strong: errors / over-budget
  pos: "#3fa772", // --sage-strong
} as const;

/** Poppins per weight — React Native does not synthesise weights for custom
 * fonts, so each weight is its own family name (loaded in `app/_layout.tsx`). */
export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
} as const;

export const radii = {
  field: 12, // web: rounded-lg
  card: 32, // web: .brand-mascot-stage
  pill: 999, // web: rounded-full buttons
} as const;

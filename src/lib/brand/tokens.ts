/**
 * The Budgts design tokens: one source for the web and the native apps
 * (docs/BRAND_GUIDELINES.md, "Native apps").
 *
 * The web paints with the CSS custom properties in src/app/globals.css; the
 * apps import this file directly (Metro `watchFolders`, mobile/metro.config.js).
 * tests/unit/brand-tokens.test.ts parses globals.css and fails if any value
 * here differs from it, so the two can't drift.
 *
 * Pure data, no imports: the frame generator (tools/generate-pixel-frames.mjs)
 * loads it with Node's type stripping, and the app bundles it for iOS and
 * Android (tests/unit/brand-purity.test.ts).
 */

/** The raw palette. Keys are the CSS custom properties, camel-cased. */
export const COLOR = {
  charcoal: "#111111",
  graphite: "#3d3d3d",
  ash: "#6e6e6e",
  stone: "#949494",
  silver: "#b9b9b9",
  gray: "#e6e6e6",
  divider: "#ececec",
  paper: "#f4f4f4",
  white: "#ffffff",
  signal: "#e54848",
  signalStrong: "#d63c3c",
  signalInk: "#c93434",
  signalWash: "#fdeeee",
  signalLine: "#f8d9d9",
  signalEdge: "#9f2a2a",
  growth: "#18794a",
  growthWash: "#e6f2eb",
  warnWash: "#fbf0da",
} as const;

/** The semantic roles components paint with (never raw hex). */
export const ROLE = {
  bg: COLOR.paper,
  surface: COLOR.white,
  surface2: "#f0f0f0",
  text: COLOR.charcoal,
  heading: COLOR.charcoal,
  muted: COLOR.ash,
  border: COLOR.gray,
  hairline: COLOR.gray,
  track: COLOR.gray,
  ink: COLOR.charcoal,
  accent: COLOR.signal,
  accentInk: "#ffffff",
  primary: COLOR.charcoal,
  onPrimary: "#ffffff",
  primaryBtn: COLOR.signalStrong,
  onPrimaryBtn: "#ffffff",
  tint: "#f2f2f2",
  pos: COLOR.growth,
  neg: COLOR.signalInk,
  warn: "#8a5a00",
  ring: COLOR.charcoal,
  fillUnder: COLOR.charcoal,
  fillOver: COLOR.signal,
  cellPast: "#c9c9c9",
} as const;

/** A field's placeholder text (web `fieldClass`, placeholder:text-[#767676]: 4.5:1 on white). */
export const PLACEHOLDER = "#767676";

/**
 * The font families, all files under src/app/fonts (SIL OFL 1.1). Geist and
 * Geist Mono are the fonts the web loads through `next/font/google`, as Google
 * Fonts' static instances; each weight is its own family on native, where
 * custom fonts never synthesise a weight.
 */
export const FONT = {
  geist: { 400: "Geist-Regular", 500: "Geist-Medium", 600: "Geist-SemiBold" },
  geistMono: "GeistMono-Regular",
  dogicaBold: "Dogica-Bold",
  dogicaPixel: "Dogica-Pixel",
} as const;

export type GeistWeight = keyof typeof FONT.geist;

/** Each native family's file, from the repo root (the web loads the same
 * Dogica files through next/font/local, and Geist through next/font/google). */
export const FONT_FILES = {
  "Geist-Regular": "src/app/fonts/geist/Geist-Regular.ttf",
  "Geist-Medium": "src/app/fonts/geist/Geist-Medium.ttf",
  "Geist-SemiBold": "src/app/fonts/geist/Geist-SemiBold.ttf",
  "GeistMono-Regular": "src/app/fonts/geist/GeistMono-Regular.ttf",
  "Dogica-Bold": "src/app/fonts/dogica/dogicabold.ttf",
  "Dogica-Pixel": "src/app/fonts/dogica/dogicapixel.ttf",
} as const;

/**
 * Dogica sets on its 8px grid with a space trimmed by two font-pixels
 * (CSS `word-spacing: -0.25em`). React Native has no word-spacing, so the
 * native text component narrows each space by this much instead.
 */
export const DOGICA_WORD_SPACING_EM = -0.25;

export type TypeRole = {
  face: "geist" | "geistMono" | "dogicaBold" | "dogicaPixel";
  /** Geist only; each Dogica file is one weight */
  weight?: GeistWeight;
  /** px at phone width (the apps' only width) */
  size: number;
  lineHeight: number;
  /** letter-spacing: `em` scales with size, `px` doesn't */
  tracking: { em: number } | { px: number };
  uppercase?: boolean;
  tabular?: boolean;
};

/**
 * The type roles at phone width: the `.px-*` (Dogica) and `.t-*` (Geist)
 * classes in globals.css, then the reading styles BRAND_GUIDELINES lists
 * (body, meta, labels, buttons, inputs), which the web sets with utilities.
 */
export const TYPE = {
  pxTitle: { face: "dogicaBold", size: 16, lineHeight: 24, tracking: { px: 0 } },
  pxFigure: { face: "dogicaBold", size: 16, lineHeight: 24, tracking: { px: 0 } },
  pxFigureLg: { face: "dogicaBold", size: 32, lineHeight: 40, tracking: { px: 0 } },
  pxTag: { face: "dogicaPixel", size: 8, lineHeight: 12, tracking: { px: 1 }, uppercase: true },
  pxTagBold: { face: "dogicaBold", size: 8, lineHeight: 12, tracking: { px: 1 }, uppercase: true },
  pxLabel: { face: "dogicaPixel", size: 16, lineHeight: 24, tracking: { px: 0 } },
  tNumXl: { face: "geist", weight: 600, size: 32, lineHeight: 40, tracking: { em: -0.03 }, tabular: true },
  tNumLg: { face: "geist", weight: 600, size: 22, lineHeight: 28, tracking: { em: -0.02 }, tabular: true },
  tNum: { face: "geist", weight: 600, size: 17, lineHeight: 24, tracking: { em: -0.01 }, tabular: true },
  tHead: { face: "geist", weight: 600, size: 15, lineHeight: 24, tracking: { em: -0.01 } },
  tLabel: { face: "geist", weight: 500, size: 12, lineHeight: 16, tracking: { px: 0 } },
  tLabelStrong: { face: "geist", weight: 600, size: 12, lineHeight: 16, tracking: { px: 0 } },
  // reading styles (BRAND_GUIDELINES → Typography)
  body: { face: "geist", weight: 400, size: 15, lineHeight: 24, tracking: { px: 0 } },
  bodyStrong: { face: "geist", weight: 600, size: 15, lineHeight: 24, tracking: { px: 0 } },
  listName: { face: "geist", weight: 500, size: 15, lineHeight: 24, tracking: { px: 0 } },
  /** small print (web text-xs): the "or" between sign-in methods */
  caption: { face: "geist", weight: 400, size: 12, lineHeight: 16, tracking: { px: 0 } },
  meta: { face: "geist", weight: 400, size: 13, lineHeight: 20, tracking: { px: 0 } },
  metaStrong: { face: "geist", weight: 500, size: 13, lineHeight: 20, tracking: { px: 0 } },
  formLabel: { face: "geist", weight: 500, size: 14, lineHeight: 20, tracking: { px: 0 } },
  /** small reading text (web `text-sm leading-5`): hints, empty-state bodies, notes under a field */
  small: { face: "geist", weight: 400, size: 14, lineHeight: 20, tracking: { px: 0 } },
  button: { face: "geist", weight: 600, size: 15, lineHeight: 24, tracking: { px: 0 } },
  input: { face: "geist", weight: 400, size: 16, lineHeight: 24, tracking: { px: 0 } },
  /** technical lines (the sign-in savings ticker: font-mono 13/20) */
  mono: { face: "geistMono", size: 13, lineHeight: 20, tracking: { px: 0 } },
  /** a sheet or card heading (web `text-xl font-semibold tracking-tight`) */
  heading: { face: "geist", weight: 600, size: 20, lineHeight: 28, tracking: { em: -0.025 } },
} as const satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof TYPE;

/** Letter-spacing of a role in px at its own size. */
export function trackingPx(role: TypeRole): number {
  return "em" in role.tracking ? role.tracking.em * role.size : role.tracking.px;
}

/** Layout at phone width, in px (BRAND_GUIDELINES → Components). */
export const SPACE = {
  /** the page gutter on every phone screen */
  gutter: 24,
  /** a card's padding inside its 8px frame (16px from the edge in all) */
  cardPad: 8,
  /** buttons: md 36px (a 6px frame around a 24px line), lg 44px (a full touch target) */
  buttonMd: 36,
  buttonLg: 44,
  /** fields are 44px tall: a touch target */
  field: 44,
  /** icon tiles */
  tile: 32,
  /** the smallest touch target the apps allow */
  touch: 44,
} as const;

export type Shadow = { x: number; y: number; blur: number; spread: number; rgb: readonly [number, number, number]; alpha: number };

/** Elevation, below the card only: each spread is pulled in wider than the
 * corner steps, so a shadow never shows beside a notch. Tinted with the ink. */
export const SHADOW = {
  card: [{ x: 0, y: 10, blur: 20, spread: -16, rgb: [17, 17, 17], alpha: 0.1 }],
  raised: [
    { x: 0, y: 2, blur: 6, spread: -4, rgb: [17, 17, 17], alpha: 0.08 },
    { x: 0, y: 22, blur: 40, spread: -26, rgb: [17, 17, 17], alpha: 0.22 },
  ],
} as const satisfies Record<string, readonly Shadow[]>;

/** A shadow list as CSS (`globals.css` spelling; React Native's `boxShadow` reads it too). */
export function shadowCss(list: readonly Shadow[]): string {
  return list
    .map(({ x, y, blur, spread, rgb, alpha }) => `${px(x)} ${px(y)} ${px(blur)} ${px(spread)} rgb(${rgb.join(" ")} / ${alpha})`)
    .join(", ");
}
const px = (n: number) => (n === 0 ? "0" : `${n}px`);

/** The primary button's raised edge (`.px-raise`): a 2px drop below it. */
export const RAISE = { y: 2, color: COLOR.signalEdge } as const;

/** Motion timings (globals.css keyframes and their `animation` lines). */
export const MOTION = {
  /** --ease-out */
  easeOut: [0.16, 1, 0.3, 1],
  pageEnterMs: 420,
  riseInMs: 560,
  /** a reveal cascade: each section `i` starts i × step + base */
  revealStepMs: 70,
  revealBaseMs: 40,
  /** a progress bar's cells arrive over this, whatever its length */
  cellsSweepMs: 352,
  cellStepMs: 22,
  robinBlinkMs: 4800,
  robinChirpMs: 4000,
  robinFlickerMs: 3200,
  robinHopMs: 360,
  pressScale: 0.98,
} as const;

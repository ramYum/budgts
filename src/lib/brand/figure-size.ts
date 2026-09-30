/**
 * The size of a screen's one money figure (Home's Money left, Budgets' left to
 * spend, Goals' saved, Insights' net): the hero size, stepping down past 13
 * characters on a phone rather than run out of its card. One rule for the web's
 * `figureSize` (src/components/ui.tsx) and the apps' `figureVariant`
 * (mobile/components/kit/figure.ts).
 */
export type FigureSize = "hero" | "stepped";

export const FIGURE_HERO_MAX_CHARS = 13;

export function figureSizeOf(text: string): FigureSize {
  return text.length <= FIGURE_HERO_MAX_CHARS ? "hero" : "stepped";
}

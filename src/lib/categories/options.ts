/** Category kinds and the colour palette offered when creating a category.
 * Plain data, no Zod: client forms import it without pulling the validation
 * library into the browser (`categoryFormSchema` in
 * src/lib/validation/category.ts validates against it). */
export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Palette offered when creating a category. */
export const CATEGORY_COLORS = [
  "#8b5cf6",
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#ef4444",
  "#06b6d4",
  "#6b716e",
] as const;

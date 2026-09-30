import type { IconName } from "./icons.ts";

/**
 * A category's glyph: the standard categories have their own, anything custom
 * (or unmapped) gets a tag. Monochrome on purpose: category identity is the
 * icon and the name, never a hue. Shared by the web's <CategoryIcon>
 * (src/components/ui.tsx) and the apps' (mobile/components/kit).
 */
const CATEGORY_ICON: Record<string, IconName> = {
  Housing: "home",
  Transportation: "car",
  "Food / Groceries": "cart",
  Entertainment: "gamepad",
  "Personal Care": "heart",
  Insurances: "shield",
  Salary: "briefcase",
  "Other Income": "trending-up",
  Transfer: "transfer",
};

export function categoryIcon(name: string): IconName {
  return CATEGORY_ICON[name] ?? "tag";
}

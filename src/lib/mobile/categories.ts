/**
 * The native Settings → Categories view-model: the contract of `GET /api/mobile/settings/categories`. A projection of
 * `loadCategorySettings` (`src/lib/categories/load-category-settings.ts`, the reads the web page renders).
 */
import type { CategorySettings } from "@/lib/categories/load-category-settings";
import { MOBILE_API_VERSION } from "@/lib/mobile/reads";

export type MobileManagedCategory = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  archived: boolean;
  /** This month's transactions in it (tapping one opens Activity filtered to it). */
  txnCount: number;
};

export type MobileCategorySettings = {
  version: typeof MOBILE_API_VERSION;
  /** `YYYY-MM`, the user's current month in their own time zone (the month the counts cover). */
  month: string;
  /** Every category, active and archived, by name. */
  categories: MobileManagedCategory[];
};

export function buildMobileCategorySettings(data: CategorySettings): MobileCategorySettings {
  return {
    version: MOBILE_API_VERSION,
    month: data.month,
    categories: data.items.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      archived: c.is_archived,
      txnCount: c.txnCount,
    })),
  };
}

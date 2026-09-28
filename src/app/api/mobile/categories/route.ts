/**
 * GET /api/mobile/categories — the caller's active categories (for the category picker). Read-only: category management is
 * post-launch scope (docs/specs/2026-09-17-mobile-app-launch-design.md §7).
 */
import { MOBILE_API_VERSION, loadCategories } from "@/lib/mobile/reads";
import { mobileJson, mobileRoute } from "@/lib/mobile/route";

export const GET = mobileRoute(async ({ supabase }) => {
  return mobileJson({ version: MOBILE_API_VERSION, categories: await loadCategories(supabase) });
});

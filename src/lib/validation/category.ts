import { z } from "zod";

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

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
  kind: z.enum(CATEGORY_KINDS),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour")
    .optional()
    .transform((v) => v ?? "#6b716e"),
});

export type CategoryFormInput = z.infer<typeof categoryFormSchema>;

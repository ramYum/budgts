import { z } from "zod";
import { CATEGORY_KINDS } from "@/lib/categories/options";

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

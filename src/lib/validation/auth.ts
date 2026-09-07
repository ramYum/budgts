import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.email("Enter a valid email address")),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

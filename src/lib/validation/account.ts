import { z } from "zod";

export const ACCOUNT_TYPES = ["checking", "credit", "cash", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
  type: z.enum(ACCOUNT_TYPES),
});

export type AccountFormInput = z.infer<typeof accountFormSchema>;

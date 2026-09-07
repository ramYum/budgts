import { z } from "zod";
import { parseMoney } from "@/lib/budget/money";

export const DIRECTIONS = ["debit", "credit"] as const;
export type Direction = (typeof DIRECTIONS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date ("YYYY-MM-DD") -> an ISO timestamp at noon UTC. Noon keeps
 * the transaction in the picked month regardless of the viewer's timezone. */
export function dateToIso(dateStr: string): string {
  if (!ISO_DATE.test(dateStr)) throw new Error(`dateToIso: expected YYYY-MM-DD, got ${JSON.stringify(dateStr)}`);
  return new Date(`${dateStr}T12:00:00.000Z`).toISOString();
}

const optionalCategoryId = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === "" || s === "null" ? null : s))
  .pipe(z.uuid("Invalid category").nullable());

const amount = z.string().transform((raw, ctx) => {
  let minor: number;
  try {
    minor = parseMoney(raw);
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount like 12.34" });
    return z.NEVER;
  }
  if (minor <= 0) {
    ctx.addIssue({ code: "custom", message: "Amount must be greater than zero" });
    return z.NEVER;
  }
  return minor;
});

export const transactionFormSchema = z.object({
  accountId: z.uuid("Choose an account"),
  categoryId: optionalCategoryId,
  amount,
  direction: z.enum(DIRECTIONS),
  occurredAt: z.string().regex(ISO_DATE, "Pick a date"),
  description: z
    .string()
    .trim()
    .max(200, "Keep the description under 200 characters")
    .optional()
    .transform((v) => v ?? ""),
  note: z
    .string()
    .trim()
    .max(1000, "Keep the note under 1000 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isTransfer: z
    .preprocess((v) => v === "on" || v === "true" || v === true, z.boolean())
    .default(false),
});

export type TransactionFormInput = z.infer<typeof transactionFormSchema>;

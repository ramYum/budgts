import { z } from "zod";
import { parseMoney } from "@/lib/budget/money";

const MONTH_RE = /^\d{4}-\d{2}$/;

const budgetAmount = z.string().transform((raw, ctx) => {
  const s = raw.trim();
  if (s === "") return 0;
  let minor: number;
  try {
    minor = parseMoney(s);
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount like 400 or 1234.50" });
    return z.NEVER;
  }
  if (minor < 0) {
    ctx.addIssue({ code: "custom", message: "A budget can't be negative" });
    return z.NEVER;
  }
  return minor;
});

export const budgetFormSchema = z.object({
  categoryId: z.uuid("Invalid category"),
  month: z.string().regex(MONTH_RE, "Invalid month"),
  amount: budgetAmount,
});

export type BudgetFormInput = z.infer<typeof budgetFormSchema>;

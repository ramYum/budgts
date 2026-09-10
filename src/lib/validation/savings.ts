import { z } from "zod";
import { parseMoney } from "@/lib/budget/money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A required, strictly-positive money string ("400", "1,234.50") -> minor units. */
const positiveAmount = z.string().transform((raw, ctx) => {
  const s = raw.trim();
  if (s === "") {
    ctx.addIssue({ code: "custom", message: "Enter an amount" });
    return z.NEVER;
  }
  let minor: number;
  try {
    minor = parseMoney(s);
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount like 400 or 1234.50" });
    return z.NEVER;
  }
  if (minor <= 0) {
    ctx.addIssue({ code: "custom", message: "Enter an amount above 0" });
    return z.NEVER;
  }
  return minor;
});

/** Optional target date: "" -> null, otherwise a YYYY-MM-DD string. */
const optionalDate = z.string().transform((raw, ctx) => {
  const s = raw.trim();
  if (s === "") return null;
  if (!DATE_RE.test(s)) {
    ctx.addIssue({ code: "custom", message: "Invalid date" });
    return z.NEVER;
  }
  return s;
});

const optionalNote = z
  .string()
  .max(200, "Keep the note under 200 characters")
  .transform((s) => {
    const t = s.trim();
    return t === "" ? null : t;
  });

export const savingsGoalFormSchema = z.object({
  name: z.string().trim().min(1, "Name your goal").max(60, "Keep the name under 60 characters"),
  targetAmount: positiveAmount,
  targetDate: optionalDate,
});

export type SavingsGoalFormInput = z.infer<typeof savingsGoalFormSchema>;

/**
 * One contribution's form input. `amount` is always positive here — the
 * "withdraw / correct" server action negates it before insert, so the user
 * never types a minus sign.
 */
export const contributionFormSchema = z.object({
  goalId: z.uuid("Invalid goal"),
  amount: positiveAmount,
  occurredAt: z.string().regex(DATE_RE, "Invalid date"),
  note: optionalNote,
});

export type ContributionFormInput = z.infer<typeof contributionFormSchema>;

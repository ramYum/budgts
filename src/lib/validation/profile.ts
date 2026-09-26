import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/budget/currencies";

export const currencySchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
});

export type CurrencyInput = z.infer<typeof currencySchema>;

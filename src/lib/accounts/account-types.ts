/** The kinds of account a user can keep. Plain data, no Zod: client pickers
 * import it without pulling the validation library into the browser
 * (`accountFormSchema` in src/lib/validation/account.ts validates against it). */
export const ACCOUNT_TYPES = ["checking", "credit", "cash", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

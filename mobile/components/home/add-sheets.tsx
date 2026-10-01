import { AddIncomeSheet, AddTransactionSheet, type TransactionFormData } from "../activity/transaction-sheets";
import { authFetch } from "../../lib/auth/api";
import { useVersion } from "../../lib/api/invalidate";
import { loadResource } from "../../lib/api/load";
import { useResource } from "../../lib/api/use-resource";
import { parseAccounts } from "../../lib/accounts/accounts-api";
import { parseCategories } from "../../lib/categories/categories-api";
import { useTransactionCommands } from "../../lib/transactions/use-transaction-commands";

export type HomeSheet = "income" | "add";

/**
 * Home's two add sheets (web `income-tile.tsx` `AddIncome` and `add-transaction.tsx`), the same sheets Activity opens:
 * Add income (money in, income categories, "Add") from the plus by Came in and the set-up step, Add transaction from
 * "Add one by hand". Mounted only while one is open, so Home's own load reads nothing extra; the sheet waits for its
 * accounts and categories and offers Try again if either fails. A save refreshes Home, Activity and Budgets (the commands
 * invalidate them).
 */
export function HomeAddSheets({ sheet, defaultDate, onClose }: { sheet: HomeSheet; defaultDate: string; onClose: () => void }) {
  const accountsVersion = useVersion("accounts");
  const accounts = useResource("home-sheet-accounts", (s) => loadResource(() => authFetch("/api/mobile/accounts", s), parseAccounts), {
    version: accountsVersion,
  });
  // versioned, so a category added, renamed or archived elsewhere shows here (every category write invalidates transactions)
  const categoriesVersion = useVersion("transactions");
  const categories = useResource("home-sheet-categories", (s) => loadResource(() => authFetch("/api/mobile/categories", s), parseCategories), {
    version: categoriesVersion,
  });
  const commands = useTransactionCommands();
  const data: TransactionFormData = {
    accounts: accounts.state,
    categories: categories.state,
    onRetry: () => {
      void accounts.reload();
      void categories.reload();
    },
  };
  return sheet === "income" ? (
    <AddIncomeSheet data={data} defaultDate={defaultDate} commands={commands} onClose={onClose} />
  ) : (
    <AddTransactionSheet data={data} defaultDate={defaultDate} commands={commands} onClose={onClose} />
  );
}

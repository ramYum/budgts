import { apiRequest } from "../api/request";
import { bool, int, list, obj, oneOf, str } from "../api/parse";

/**
 * Settings → Categories over the mobile API: `GET /api/mobile/settings/categories` (server: src/lib/mobile/categories.ts,
 * the reads the web page renders), `POST /api/mobile/categories` (add) and `PATCH /api/mobile/categories/:id` (edit,
 * archive, restore), the web Server Actions' own commands. Failures read as the web's form says them
 * (src/server/categories.ts).
 */
export type ManagedCategory = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  archived: boolean;
  /** this month's transactions in it */
  txnCount: number;
};

export type CategorySettings = { month: string; categories: ManagedCategory[] };

export function parseCategorySettings(body: unknown): CategorySettings {
  const b = obj(body, "category settings");
  if (b.version !== 1) throw new Error("category settings: version");
  const month = str(b.month, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("category settings: month");
  return {
    month,
    categories: list(b.categories, "categories", (v, i) => {
      const c = obj(v, `categories[${i}]`);
      return {
        id: str(c.id, "id"),
        name: str(c.name, "name"),
        kind: oneOf(c.kind, "kind", ["expense", "income"] as const),
        color: str(c.color, "color"),
        archived: bool(c.archived, "archived"),
        txnCount: int(c.txnCount, "txnCount"),
      };
    }),
  };
}

/** The web page's groups, in its order, empty ones left out: active expense, active income, archived. */
export function categoryGroups(categories: ManagedCategory[]): { key: "expense" | "income" | "archived"; title: string; list: ManagedCategory[] }[] {
  const active = categories.filter((c) => !c.archived);
  const groups = [
    { key: "expense" as const, title: "Expense", list: active.filter((c) => c.kind === "expense") },
    { key: "income" as const, title: "Income", list: active.filter((c) => c.kind === "income") },
    { key: "archived" as const, title: "Archived", list: categories.filter((c) => c.archived) },
  ];
  return groups.filter((g) => g.list.length > 0);
}

/** "Nothing this month", "1 transaction this month", "3 transactions this month". */
export function monthCountLine(n: number): string {
  return n === 0 ? "Nothing this month" : `${n} ${n === 1 ? "transaction" : "transactions"} this month`;
}

/** The colour a new category gets: the palette's first (src/lib/categories/options.ts, pinned by test), as the web form's hidden field. */
export const NEW_CATEGORY_COLOR = "#8b5cf6";

export const LOCKED_MESSAGE = "Your account is being deleted, so changes are paused.";
export const GONE_MESSAGE = "That category no longer exists. Refresh and try again.";
const FAILED_MESSAGE = "Couldn't save the category. Try again.";
const NETWORK_MESSAGE = "Couldn't reach Budgts. Check your connection and try again.";
const AUTH_MESSAGE = "Your session has expired. Please sign in again.";

/** A write's outcome as the form shows it: done, a field's own message, or the form's message. */
export type CategoryWrite = { ok: true } | { ok: false; fieldError?: string; error?: string };

export async function writeCategory(fetcher: () => Promise<Response>): Promise<CategoryWrite> {
  const r = await apiRequest(fetcher, () => true);
  if (r.ok) return { ok: true };
  if (r.kind === "auth") return { ok: false, error: AUTH_MESSAGE };
  if (r.kind === "network") return { ok: false, error: NETWORK_MESSAGE };
  if (r.kind === "rejected") {
    if (r.code === "invalid") return { ok: false, fieldError: Object.values(r.fieldErrors ?? {})[0] ?? "Invalid category" };
    if (r.code === "not_found") return { ok: false, error: GONE_MESSAGE };
    if (r.code === "account_locked") return { ok: false, error: LOCKED_MESSAGE };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

export type CategoryFields = { name: string; kind: "expense" | "income"; color: string };

/** The POST body for a new category; the request id makes a retry return the category that already landed. */
export function createBody(fields: CategoryFields, requestId: string): CategoryFields & { requestId: string } {
  return { ...fields, requestId };
}

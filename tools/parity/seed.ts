/**
 * P1: the parity users on STAGING (docs: tools/parity/README.md). Each run deletes and recreates every `parity+<name>@
 * budgts.test` user, then gives it one state the parity check compares (firstrun, tour, empty, full, over, banks, deleting).
 *
 * Every financial write goes through the app's own shared commands (`src/lib/*\/commands.ts`, `completeOnboarding`,
 * `markTourSeen`) as the signed-in user, over a Supabase session minted from a magic-link token: the same validation and
 * the same RLS as a real user, and no financial logic of its own. The `banks` user is connected through the running local
 * web server (`/api/plaid/test/seed` → `/api/plaid/exchange` → the mobile map and sync routes), which must be up on
 * PARITY_WEB_URL with PLAID_TEST_SEED_ENABLED=1 (`npm run parity:serve`).
 *
 * Three display states have no user action that produces them, so the service-role client sets them on these disposable
 * users only (never a financial row): the deletion lock (`account_deletions`, what starting a deletion inserts), one bank
 * account's review flag (`plaid_accounts.needs_review`, set by the anomaly detector) and the connection date that makes
 * the limited-history notice show (`plaid_items.created_at`).
 *
 *   npx tsx tools/parity/seed.ts [--only full,over] [--skip-banks]
 *
 * Writes .tmp/parity/users.json (name → id + email). No email or token is printed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAccount } from "@/lib/accounts/commands";
import { createCategory } from "@/lib/categories/commands";
import { setBudget } from "@/lib/budgets/commands";
import { createManualTransaction } from "@/lib/transactions/commands";
import { createGoal, addContribution } from "@/lib/goals/commands";
import { completeOnboarding } from "@/lib/profile/onboarding";
import { markTourSeen } from "@/lib/tour/load-tour";
import { todayDateKey } from "@/lib/budget/month";
import { loadStagingEnv, STAGING_REF } from "./env";
import { admin, signIn, USERS_FILE, type SeededUsers } from "./auth";
import {
  ACCOUNTS,
  CUSTOM_CATEGORIES,
  GOALS,
  PARITY_CURRENCY,
  PARITY_TIME_ZONE,
  PARITY_USERS,
  TRANSACTIONS,
  budgets,
  parityEmail,
  seedDate,
  type AccountKey,
  type ParityUserName,
} from "./data";

const WEB = process.env.PARITY_WEB_URL ?? "http://localhost:3200";

function short(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function must<T extends { ok: boolean }>(what: string, r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`parity seed: ${what} failed: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function onboard(supabase: SupabaseClient, userId: string): Promise<void> {
  must("onboarding", await completeOnboarding(supabase, userId, { currency: PARITY_CURRENCY, time_zone: PARITY_TIME_ZONE }));
}

async function ledger(supabase: SupabaseClient, userId: string, variant: "full" | "over", today: string): Promise<void> {
  const month = today.slice(0, 7);
  const accountIds = {} as Record<AccountKey, string>;
  for (const a of ACCOUNTS) accountIds[a.key] = must(`account ${a.name}`, await createAccount(supabase, userId, { name: a.name, type: a.type })).id;
  for (const c of CUSTOM_CATEGORIES) must(`category ${c.name}`, await createCategory(supabase, userId, c));

  const { data: cats, error } = await supabase.from("categories").select("id, name").eq("user_id", userId);
  if (error || !cats) throw error ?? new Error("categories read failed");
  const categoryId = (name: string) => {
    const hit = cats.find((c) => c.name === name);
    if (!hit) throw new Error(`parity seed: no category named ${name}`);
    return hit.id as string;
  };

  for (const b of budgets(variant)) {
    must(`budget ${b.category}`, await setBudget(supabase, userId, { categoryId: categoryId(b.category), month, amount: b.amount }));
  }
  // Serial on purpose: the app's own insert path, one row at a time, like a person adding them.
  for (const t of TRANSACTIONS) {
    must(
      `transaction ${t.description}`,
      await createManualTransaction(supabase, userId, {
        accountId: accountIds[t.account],
        categoryId: t.category ? categoryId(t.category) : null,
        amount: t.amount,
        direction: t.direction,
        occurredAt: seedDate(today, t.monthsBack, t.day),
        description: t.description,
        note: "",
        isTransfer: t.isTransfer ?? false,
      }),
    );
  }
  for (const g of GOALS) {
    const goalId = must(`goal ${g.name}`, await createGoal(supabase, userId, { name: g.name, targetAmount: g.target, targetDate: "" })).id;
    for (const c of g.contributions) {
      must(
        `contribution ${g.name}`,
        await addContribution(supabase, userId, { goalId, amount: c.amount, occurredAt: seedDate(today, c.monthsBack, c.day), note: "" }, 1),
      );
    }
  }
}

async function api(path: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${WEB}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`parity seed: ${init.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

type Bank = { id: string; itemId: string; accounts: { rowId: string; plaidAccountId: string; name: string | null; linkState: string }[] };

/** Sandbox's First Platypus Bank: Checking and Saving imported, the rest skipped; synced until rows land (bounded). */
async function connectSandboxBank(token: string, userId: string): Promise<string[]> {
  const seed = await api("/api/plaid/test/seed", token, { method: "POST", body: {} });
  const exchanged = (await api("/api/plaid/exchange", token, {
    method: "POST",
    body: { public_token: seed.public_token, institution: seed.institution },
  })) as { plaidItemId: string; accounts: { plaidAccountId: string; name: string }[] };
  const entries = exchanged.accounts.map((a) =>
    a.name === "Plaid Checking"
      ? { plaidAccountId: a.plaidAccountId, mode: "new", name: "Platypus checking", type: "checking" }
      : a.name === "Plaid Saving"
        ? { plaidAccountId: a.plaidAccountId, mode: "new", name: "Platypus saving", type: "savings" }
        : { plaidAccountId: a.plaidAccountId, mode: "ignore" },
  );
  await api("/api/mobile/plaid/accounts/map", token, { method: "POST", body: { plaidItemId: exchanged.plaidItemId, entries } });

  const bank = ((await api("/api/mobile/plaid/banks", token)).banks as Bank[]).find((b) => b.id === exchanged.plaidItemId)!;
  // Sandbox builds a new item's history asynchronously; sync until the first rows land (the e2e suite's wait, bounded).
  const deadline = Date.now() + 150_000;
  for (;;) {
    await api("/api/mobile/plaid/sync", token, { method: "POST", body: { itemId: bank.itemId } }).catch(() => undefined);
    const { count } = await admin().from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "bank");
    if ((count ?? 0) > 0) break;
    if (Date.now() > deadline) throw new Error("parity seed: Sandbox history never landed");
    await new Promise((r) => setTimeout(r, 5_000));
  }
  const notes: string[] = [];

  // Review flag on the savings account (what the anomaly detector sets): the "Totals may be inaccurate" banner.
  const saving = bank.accounts.find((a) => a.name === "Plaid Saving");
  if (saving) {
    const { error } = await admin().from("plaid_accounts").update({ needs_review: true }).eq("id", saving.rowId).eq("user_id", userId);
    if (error) throw error;
    notes.push("review flag on Plaid Saving");
  }
  // Limited history: the notice shows when no row predates the connection day, so date the connection to the earliest row.
  const { data: earliest } = await admin()
    .from("transactions")
    .select("occurred_at")
    .eq("user_id", userId)
    .eq("source", "bank")
    .order("occurred_at", { ascending: true })
    .limit(1);
  const first = earliest?.[0]?.occurred_at as string | undefined;
  if (first) {
    const { error } = await admin().from("plaid_items").update({ created_at: first }).eq("id", exchanged.plaidItemId).eq("user_id", userId);
    if (error) throw error;
    notes.push("connection dated to its earliest row (limited history)");
  }
  const status = await api("/api/mobile/status", token);
  notes.push(`needs-category ${String(status.needsCategoryCount)}`);
  return notes;
}

async function seedOne(name: ParityUserName, today: string, skipBanks: boolean): Promise<{ id: string; email: string; notes: string[] }> {
  const email = parityEmail(name);
  const existing = await findUserId(email);
  if (existing) {
    const { error } = await admin().auth.admin.deleteUser(existing);
    if (error) throw error;
  }
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const id = data.user.id;
  const notes: string[] = [];
  if (name === "firstrun") return { id, email, notes: ["no currency yet"] };

  const { supabase, accessToken } = await signIn(email);
  await onboard(supabase, id);
  if (name === "tour") return { id, email, notes: ["onboarded, welcome guide not seen"] };
  must("tour seen", await markTourSeen(supabase, id));

  if (name === "full" || name === "over") {
    await ledger(supabase, id, name, today);
    notes.push(`${TRANSACTIONS.length} transactions, 6 budgets, ${GOALS.length} goals`);
  } else if (name === "banks") {
    if (skipBanks) notes.push("bank connection skipped (--skip-banks)");
    else notes.push(...(await connectSandboxBank(accessToken, id)));
  } else if (name === "deleting") {
    const { error: lockError } = await admin().from("account_deletions").insert({ user_id: id, state: "deleting" });
    if (lockError) throw lockError;
    notes.push("deletion lock set (read-only)");
  }
  return { id, email, notes };
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith("--only="))?.slice(7) ?? (args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined);
  const only = onlyArg ? (onlyArg.split(",") as ParityUserName[]) : [...PARITY_USERS];
  const skipBanks = args.includes("--skip-banks");
  const today = todayDateKey(PARITY_TIME_ZONE); // the users' today: no row is dated after it
  const month = today.slice(0, 7);
  console.log(`parity seed → staging ${STAGING_REF}, today ${today} (${PARITY_TIME_ZONE})`);

  mkdirSync(dirname(USERS_FILE), { recursive: true });
  let users: SeededUsers["users"] = {};
  try {
    users = (JSON.parse(readFileSync(USERS_FILE, "utf8")) as SeededUsers).users ?? {};
  } catch {
    users = {};
  }
  for (const name of only) {
    const r = await seedOne(name, today, skipBanks);
    users[name] = { id: r.id, email: r.email };
    console.log(`  ${name.padEnd(9)} ${short(r.id)}  ${r.notes.join("; ")}`);
  }
  const seeded: SeededUsers = { project: STAGING_REF, month, timeZone: PARITY_TIME_ZONE, users };
  writeFileSync(USERS_FILE, JSON.stringify(seeded, null, 2));
  console.log(`wrote .tmp/parity/users.json (${Object.keys(users).length} users)`);
}

loadStagingEnv();
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

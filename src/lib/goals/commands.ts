/**
 * Savings-goal commands (create, edit, archive / restore, add to or take from a goal): the one implementation behind the
 * web Server Actions (`src/server/savings.ts`) and the native `/api/mobile/goals*` routes. Validation is the shared
 * `savingsGoalFormSchema` / `contributionFormSchema`; amounts arrive as decimal strings and are stored in integer minor
 * units. Callers pass the CALLER'S Supabase client, so RLS scopes every write and another user's id matches nothing
 * (`missing`). Moved out of the web actions (2026-09-29, Stage 2B) without changing a rule.
 *
 * Retries: a native caller may send a `requestId` (a UUID it generated). It becomes the new row's primary key, so a retry
 * after a lost response hits the key it already used and returns the row that landed instead of saving a second goal or
 * a second contribution (a doubled contribution would overstate what is saved). `replayed: true` says so: that call's
 * values were not applied (the app tells the user, as it does for transactions); the web Server Actions ignore it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalid, type Failed, type Invalid, type Locked } from "@/lib/command-result";
import { lockedOr, missingOrLocked, referencesVisible } from "@/lib/ownership";
import { contributionFormSchema, savingsGoalFormSchema } from "@/lib/validation/savings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";

type Missing = { ok: false; error: "missing" };

/** `replayed`: the request id was already used, so `id` is the row that landed first and nothing of this call was written. */
type Inserted = { ok: true; id: string; replayed: boolean };

export type CreateGoalResult = Inserted | Invalid | Locked | Failed;
export type GoalWriteResult = { ok: true } | Invalid | Missing | Locked | Failed;
export type ContributionResult = Inserted | Invalid | Missing | Locked | Failed;

function badRequestId(requestId: string | undefined): Invalid | null {
  return requestId !== undefined && !UUID.test(requestId)
    ? { ok: false, error: "invalid", fieldErrors: { requestId: "Invalid request id" } }
    : null;
}

/**
 * Inserts one row; with a `requestId`, a replay (the key already exists and RLS shows it to this caller) returns the row
 * that landed (`replayed: true`). A key held by anyone else is invisible under RLS, so the insert error stands.
 */
async function insertOnce(
  supabase: SupabaseClient,
  table: "savings_goals" | "savings_contributions",
  row: Record<string, unknown>,
  requestId: string | undefined,
): Promise<Inserted | Locked | Failed> {
  const { data, error } = await supabase
    .from(table)
    .insert(requestId ? { id: requestId, ...row } : row)
    .select("id")
    .single();
  if (!error && data) return { ok: true, id: (data as { id: string }).id, replayed: false };
  if (requestId && error?.code === UNIQUE_VIOLATION) {
    const { data: landed } = await supabase.from(table).select("id").eq("id", requestId).maybeSingle();
    if (landed) return { ok: true, id: (landed as { id: string }).id, replayed: true };
  }
  return lockedOr(supabase, { ok: false, error: "failed", message: error?.message ?? "Could not save." } as const);
}

export async function createGoal(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown,
  requestId?: string,
): Promise<CreateGoalResult> {
  const parsed = savingsGoalFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const bad = badRequestId(requestId);
  if (bad) return bad;

  const { name, targetAmount, targetDate } = parsed.data;
  return insertOnce(
    supabase,
    "savings_goals",
    { user_id: userId, name, target_amount: targetAmount, target_date: targetDate },
    requestId,
  );
}

export async function updateGoal(supabase: SupabaseClient, id: string, raw: unknown): Promise<GoalWriteResult> {
  const parsed = savingsGoalFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);

  const { name, targetAmount, targetDate } = parsed.data;
  const { data, error } = await supabase
    .from("savings_goals")
    .update({ name, target_amount: targetAmount, target_date: targetDate })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : missingOrLocked(supabase);
}

export async function setGoalArchived(
  supabase: SupabaseClient,
  id: string,
  archived: boolean,
): Promise<Exclude<GoalWriteResult, Invalid>> {
  const { data, error } = await supabase.from("savings_goals").update({ is_archived: archived }).eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : missingOrLocked(supabase);
}

/**
 * Records one contribution. `sign` is +1 for "add" and -1 for "withdraw / correct": the amount is always typed positive
 * and negated here, so the user never types a minus sign.
 */
export async function addContribution(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown,
  sign: 1 | -1,
  requestId?: string,
): Promise<ContributionResult> {
  const parsed = contributionFormSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const bad = badRequestId(requestId);
  if (bad) return bad;

  const { goalId, amount, occurredAt, note } = parsed.data;
  // The goal must be the caller's own: foreign keys ignore RLS, so another user's goal id would otherwise be accepted
  // (src/lib/ownership.ts). It reads as `missing`, exactly like an unknown id.
  const owned = await referencesVisible(supabase, "savings_goals", [goalId]);
  if (!owned.ok) return owned;

  return insertOnce(
    supabase,
    "savings_contributions",
    { user_id: userId, goal_id: goalId, amount: sign * amount, occurred_at: occurredAt, note },
    requestId,
  );
}

export async function deleteContribution(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: true } | Missing | Locked | Failed> {
  const { data, error } = await supabase.from("savings_contributions").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: "failed", message: error.message };
  return data?.length ? { ok: true } : missingOrLocked(supabase);
}

/**
 * The native money-direction answers (design: docs/specs/2026-10-01-card-payments-design.md §5, §5a, §5b, §5c): the
 * adapters behind `POST /api/mobile/plaid/sign-answer`, `.../sign-answer/change`, `/api/mobile/plaid/removed-held/answer`
 * and `.../removed-held/change`. Each validates the body with the web form's own schema, then calls the same server
 * function the web Server Action calls (`src/server/plaid/sign-answer.ts`, `detached-sign-answer.ts`) with the user id
 * from the verified Bearer session, never from the body; those functions check ownership of every id they are given.
 *
 * Those functions write through the server-only Drizzle connection, which the RLS deletion guard (migration 0021) does
 * not see, so each checks a started account deletion itself (through the guard's own function, with the caller's client)
 * and answers `locked`; this adapter maps it as every other native write does: 423 `account_locked`.
 *
 * Wire: success 200 `{ ok: true }` (an answer already applied, or one that matches, is success: nothing is left to do).
 * A refusal over what the screen shows is 404 / 409 with `message`, the web's own sentence (SIGN_ANSWER_MESSAGES), so the
 * app says it and offers Refresh. A bad body is 422 `invalid` with the web's form error.
 */
import type { BearerContext } from "@/lib/auth/bearer-context";
import { db } from "@/lib/db";
import { SIGN_ANSWER_MESSAGES as M } from "@/lib/plaid/sign-answer-messages";
import { answerDetachedHeldSchema, answerSignCheckSchema } from "@/lib/validation/plaid";
import { changeDetachedHeldAnswer, resolveDetachedHeldFromAnswer } from "@/server/plaid/detached-sign-answer";
import { changeSignConventionAnswer, resolveSignConventionFromAnswer } from "@/server/plaid/sign-answer";
import { mobileError, mobileJson, readObject } from "./route";

type Kind = "answer" | "change";

const invalid = () => mobileError("invalid", 422, { fieldErrors: { form: M.invalid } });
const refused = (status: 404 | 409, error: string, message: string) => mobileError(error, status, { message });
const locked = () => mobileError("account_locked", 423);

/** "Was this money going out or coming in?" under a connected bank's account: the first answer (§5) or a change (§5a/§5b). */
export async function answerAccountSign({ user, supabase }: BearerContext, request: Request, kind: Kind): Promise<Response> {
  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);
  const parsed = answerSignCheckSchema.safeParse(body);
  if (!parsed.success) return invalid();

  const { plaidAccountRowId, transactionId, answer } = parsed.data;
  if (kind === "answer") {
    const r = await resolveSignConventionFromAnswer(db(), supabase, user.id, plaidAccountRowId, transactionId, answer);
    if (r.outcome === "locked") return locked();
    if (r.outcome === "not_found") return refused(404, "not_found", M.answerGone);
    if (r.outcome === "busy") return refused(409, "busy", M.busy);
    if (r.outcome === "setting_up") return refused(409, "setting_up", M.settingUp);
    return mobileJson({ ok: true });
  }
  const r = await changeSignConventionAnswer(db(), supabase, user.id, plaidAccountRowId, transactionId, answer);
  if (r.outcome === "locked") return locked();
  if (r.outcome === "not_found") return refused(404, "not_found", M.cantChange);
  if (r.outcome === "not_answered") return refused(409, "not_answered", M.cantChange);
  if (r.outcome === "busy") return refused(409, "busy", M.busy);
  if (r.outcome === "setting_up") return refused(409, "setting_up", M.settingUp);
  return mobileJson({ ok: true });
}

/** The same question about held rows a removed bank left behind (§5c): the group comes from the transaction alone. */
export async function answerRemovedBankHeld({ user, supabase }: BearerContext, request: Request, kind: Kind): Promise<Response> {
  const body = await readObject(request);
  if (!body) return mobileError("invalid_body", 400);
  const parsed = answerDetachedHeldSchema.safeParse(body);
  if (!parsed.success) return invalid();

  const { transactionId, answer } = parsed.data;
  if (kind === "answer") {
    const r = await resolveDetachedHeldFromAnswer(db(), supabase, user.id, transactionId, answer);
    if (r.outcome === "locked") return locked();
    if (r.outcome === "not_found") return refused(404, "not_found", M.answerGone);
    return mobileJson({ ok: true });
  }
  const r = await changeDetachedHeldAnswer(db(), supabase, user.id, transactionId, answer);
  if (r.outcome === "locked") return locked();
  if (r.outcome === "not_found") return refused(404, "not_found", M.detachedCantChange);
  if (r.outcome === "not_answered") return refused(409, "not_answered", M.detachedCantChange);
  return mobileJson({ ok: true });
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const resolveDetachedHeldFromAnswer = vi.fn();
const changeDetachedHeldAnswer = vi.fn();
const fakeDb = { __db: true };
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/db", () => ({ db: () => fakeDb }));
vi.mock("@/server/plaid/detached-sign-answer", () => ({
  resolveDetachedHeldFromAnswer: (...a: unknown[]) => resolveDetachedHeldFromAnswer(...a),
  changeDetachedHeldAnswer: (...a: unknown[]) => changeDetachedHeldAnswer(...a),
}));
vi.mock("@/server/plaid/sign-answer", () => ({
  resolveSignConventionFromAnswer: vi.fn(),
  changeSignConventionAnswer: vi.fn(),
}));

import { POST as ANSWER } from "./route";
import { POST as CHANGE } from "../change/route";

const TXN = "33333333-3333-4333-8333-333333333333";
const supabase = { __as: "user-a" };
const post = (body: unknown) =>
  new Request("https://example.test/api/mobile/plaid/removed-held/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const valid = { transactionId: TXN, answer: "in" };

beforeEach(() => {
  for (const f of [getBearerContext, resolveDetachedHeldFromAnswer, changeDetachedHeldAnswer]) f.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/plaid/removed-held/answer (card payments §5c)", () => {
  it("answers for the verified user; the group comes from the transaction, never the body", async () => {
    resolveDetachedHeldFromAnswer.mockResolvedValue({ outcome: "resolved", convention: "standard", released: 3 });
    const res = await ANSWER(post({ ...valid, userId: "user-b", accountId: "someone-elses" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // the caller's own client goes along: the shared function checks a started deletion with it
    expect(resolveDetachedHeldFromAnswer).toHaveBeenCalledWith(fakeDb, supabase, "user-a", TXN, "in");
  });

  it("a group already released is success", async () => {
    resolveDetachedHeldFromAnswer.mockResolvedValue({ outcome: "already_resolved" });
    expect((await ANSWER(post(valid))).status).toBe(200);
  });

  it("refuses another user's transaction as not found, in the web's words", async () => {
    resolveDetachedHeldFromAnswer.mockResolvedValue({ outcome: "not_found" });
    const res = await ANSWER(post(valid));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "That transaction is no longer waiting. Refresh and try again." });
  });

  it("validates with the web form's schema and requires a session, before touching anything", async () => {
    expect((await ANSWER(post({ transactionId: "x", answer: "in" }))).status).toBe(422);
    expect((await ANSWER(post({ transactionId: TXN, answer: "both" }))).status).toBe(422);
    getBearerContext.mockResolvedValue(null);
    expect((await ANSWER(post(valid))).status).toBe(401);
    expect(resolveDetachedHeldFromAnswer).not.toHaveBeenCalled();
  });

  it("refuses while an account deletion has started (the shared function's `locked`) as 423", async () => {
    resolveDetachedHeldFromAnswer.mockResolvedValue({ outcome: "locked" });
    const res = await ANSWER(post(valid));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "account_locked" });
  });
});

describe("POST /api/mobile/plaid/removed-held/change (§5c Change answer)", () => {
  it("changes for the verified user; a matching answer is success", async () => {
    changeDetachedHeldAnswer.mockResolvedValue({ outcome: "changed", convention: "inverted", changedRows: 2 });
    expect((await CHANGE(post(valid))).status).toBe(200);
    expect(changeDetachedHeldAnswer).toHaveBeenCalledWith(fakeDb, supabase, "user-a", TXN, "in");
    changeDetachedHeldAnswer.mockResolvedValue({ outcome: "unchanged" });
    expect((await CHANGE(post(valid))).status).toBe(200);
  });

  it("refuses another user's rows, or rows never answered, in the web's words", async () => {
    changeDetachedHeldAnswer.mockResolvedValue({ outcome: "not_found" });
    const missing = await CHANGE(post(valid));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found", message: "These transactions can't change their answer. Refresh and try again." });
    changeDetachedHeldAnswer.mockResolvedValue({ outcome: "not_answered" });
    expect((await CHANGE(post(valid))).status).toBe(409);
  });

  it("refuses while an account deletion has started", async () => {
    changeDetachedHeldAnswer.mockResolvedValue({ outcome: "locked" });
    const res = await CHANGE(post(valid));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "account_locked" });
  });

  it("requires a session", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await CHANGE(post(valid))).status).toBe(401);
    expect(changeDetachedHeldAnswer).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const resolveSignConventionFromAnswer = vi.fn();
const changeSignConventionAnswer = vi.fn();
const fakeDb = { __db: true };
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/db", () => ({ db: () => fakeDb }));
vi.mock("@/server/plaid/sign-answer", () => ({
  resolveSignConventionFromAnswer: (...a: unknown[]) => resolveSignConventionFromAnswer(...a),
  changeSignConventionAnswer: (...a: unknown[]) => changeSignConventionAnswer(...a),
}));
vi.mock("@/server/plaid/detached-sign-answer", () => ({
  resolveDetachedHeldFromAnswer: vi.fn(),
  changeDetachedHeldAnswer: vi.fn(),
}));

import { POST as ANSWER } from "./route";
import { POST as CHANGE } from "./change/route";

const ROW = "22222222-2222-4222-8222-222222222222";
const TXN = "33333333-3333-4333-8333-333333333333";
const supabase = { __as: "user-a" };
const post = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/plaid/sign-answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const valid = { plaidAccountRowId: ROW, transactionId: TXN, answer: "out" };

beforeEach(() => {
  for (const f of [getBearerContext, resolveSignConventionFromAnswer, changeSignConventionAnswer]) f.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/plaid/sign-answer (card payments §5)", () => {
  it("answers for the verified user, never a user id from the body", async () => {
    resolveSignConventionFromAnswer.mockResolvedValue({ outcome: "resolved", convention: "inverted" });
    const res = await ANSWER(post({ ...valid, userId: "user-b" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // the caller's own client goes along: the shared function checks a started deletion with it
    expect(resolveSignConventionFromAnswer).toHaveBeenCalledWith(fakeDb, supabase, "user-a", ROW, TXN, "out");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("an account already resolved is success: nothing is left to answer", async () => {
    resolveSignConventionFromAnswer.mockResolvedValue({ outcome: "already_resolved" });
    expect((await ANSWER(post(valid))).status).toBe(200);
  });

  it("refuses another user's account or transaction as not found, in the web's words", async () => {
    // ownership is checked inside the shared function against the session user: someone else's ids read as not found
    resolveSignConventionFromAnswer.mockResolvedValue({ outcome: "not_found" });
    const res = await ANSWER(post(valid));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "That transaction is no longer waiting. Refresh and try again." });
  });

  it("says a sync is running, or the bank still awaits its account choices", async () => {
    resolveSignConventionFromAnswer.mockResolvedValue({ outcome: "busy" });
    const busy = await ANSWER(post(valid));
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ error: "busy", message: "This bank is syncing right now. Try again in a moment." });
    resolveSignConventionFromAnswer.mockResolvedValue({ outcome: "setting_up" });
    const setup = await ANSWER(post(valid));
    expect(setup.status).toBe(409);
    expect(await setup.json()).toEqual({ error: "setting_up", message: "Finish choosing which accounts to import from this bank first." });
  });

  it("validates the body with the web form's schema, before touching anything", async () => {
    for (const body of [{ ...valid, answer: "sideways" }, { ...valid, plaidAccountRowId: "nope" }, { transactionId: TXN, answer: "in" }]) {
      const res = await ANSWER(post(body));
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: "invalid", fieldErrors: { form: "Something went wrong. Refresh and try again." } });
    }
    expect((await ANSWER(post("not json", true))).status).toBe(400);
    expect((await ANSWER(post([valid]))).status).toBe(400);
    expect(resolveSignConventionFromAnswer).not.toHaveBeenCalled();
  });

  it("refuses while an account deletion has started (the shared function's `locked`) as 423", async () => {
    resolveSignConventionFromAnswer.mockResolvedValue({ outcome: "locked" });
    const res = await ANSWER(post(valid));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "account_locked" });
  });

  it("requires a valid Bearer session: missing or invalid credentials are 401 and nothing runs", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await ANSWER(post(valid))).status).toBe(401);
    expect((await CHANGE(post(valid))).status).toBe(401);
    expect(resolveSignConventionFromAnswer).not.toHaveBeenCalled();
    expect(changeSignConventionAnswer).not.toHaveBeenCalled();
  });

  it("a storage failure is a generic 503", async () => {
    resolveSignConventionFromAnswer.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await ANSWER(post(valid));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

describe("POST /api/mobile/plaid/sign-answer/change (§5a, §5b)", () => {
  it("changes for the verified user; a matching answer is success", async () => {
    changeSignConventionAnswer.mockResolvedValue({ outcome: "changed", convention: "standard", changedRows: 4 });
    const res = await CHANGE(post({ ...valid, answer: "in", userId: "user-b" }));
    expect(res.status).toBe(200);
    expect(changeSignConventionAnswer).toHaveBeenCalledWith(fakeDb, supabase, "user-a", ROW, TXN, "in");
    changeSignConventionAnswer.mockResolvedValue({ outcome: "unchanged" });
    expect((await CHANGE(post(valid))).status).toBe(200);
  });

  it("refuses another user's account, or one never answered, in the web's words", async () => {
    changeSignConventionAnswer.mockResolvedValue({ outcome: "not_found" });
    const missing = await CHANGE(post(valid));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found", message: "This account can't change its answer. Refresh and try again." });
    changeSignConventionAnswer.mockResolvedValue({ outcome: "not_answered" });
    const unanswered = await CHANGE(post(valid));
    expect(unanswered.status).toBe(409);
    expect(await unanswered.json()).toEqual({ error: "not_answered", message: "This account can't change its answer. Refresh and try again." });
  });

  it("says a sync is running, or the bank still awaits its account choices", async () => {
    changeSignConventionAnswer.mockResolvedValue({ outcome: "busy" });
    expect(await (await CHANGE(post(valid))).json()).toEqual({ error: "busy", message: "This bank is syncing right now. Try again in a moment." });
    changeSignConventionAnswer.mockResolvedValue({ outcome: "setting_up" });
    expect((await CHANGE(post(valid))).status).toBe(409);
  });

  it("validates, and refuses while an account deletion has started", async () => {
    expect((await CHANGE(post({ ...valid, transactionId: "x" }))).status).toBe(422);
    expect(changeSignConventionAnswer).not.toHaveBeenCalled();
    changeSignConventionAnswer.mockResolvedValue({ outcome: "locked" });
    const res = await CHANGE(post(valid));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "account_locked" });
  });
});

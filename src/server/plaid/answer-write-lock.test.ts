import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { changeSignConventionAnswer, resolveSignConventionFromAnswer } from "./sign-answer";
import { changeDetachedHeldAnswer, resolveDetachedHeldFromAnswer } from "./detached-sign-answer";

/**
 * Every money-direction answer writes through Drizzle as the DB owner, which the migration-0021 deletion guard doesn't
 * see. So each one asks the guard's own function first and writes nothing while an account deletion holds the lock.
 */
const locked = { rpc: vi.fn(async () => ({ data: false, error: null })) } as never;
/** Any touch of the database fails the test: a locked answer must not read or write. */
const untouchable = new Proxy({}, { get: (_t, p) => { throw new Error(`db.${String(p)} used while locked`); } }) as never;

const PA = "11111111-1111-1111-1111-111111111111";
const TX = "22222222-2222-2222-2222-222222222222";

describe("money-direction answers while an account deletion holds the write lock", () => {
  it.each([
    ["resolveSignConventionFromAnswer", () => resolveSignConventionFromAnswer(untouchable, locked, "user-a", PA, TX, "out")],
    ["changeSignConventionAnswer", () => changeSignConventionAnswer(untouchable, locked, "user-a", PA, TX, "in")],
    ["resolveDetachedHeldFromAnswer", () => resolveDetachedHeldFromAnswer(untouchable, locked, "user-a", TX, "out")],
    ["changeDetachedHeldAnswer", () => changeDetachedHeldAnswer(untouchable, locked, "user-a", TX, "in")],
  ])("%s returns locked and touches nothing", async (_name, run) => {
    expect(await run()).toEqual({ outcome: "locked" });
  });
});

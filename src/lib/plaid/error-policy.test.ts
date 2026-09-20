import { describe, expect, it } from "vitest";
import { classifyPlaidError, describeSyncError, isPlaidItemAlreadyRemoved, readPlaidError } from "./error-policy";
import { MUTATION_DURING_PAGINATION_CODE, SyncMutationDuringPagination } from "./sync-engine";

const plaidErr = (data: object) => ({ response: { data } });

/**
 * The codes below were MEASURED against the Plaid sandbox (not assumed): removing an
 * already-removed item -> 400 ITEM_ERROR/ITEM_NOT_FOUND; a nonexistent or malformed
 * token -> 400 INVALID_INPUT/INVALID_ACCESS_TOKEN; an unreachable Plaid -> a transport
 * error with no `response` at all.
 */
describe("isPlaidItemAlreadyRemoved", () => {
  it("is true ONLY for ITEM_NOT_FOUND — Plaid's answer for an item that was already removed", () => {
    expect(isPlaidItemAlreadyRemoved(plaidErr({ error_type: "ITEM_ERROR", error_code: "ITEM_NOT_FOUND" }))).toBe(true);
  });

  it.each([
    // The token itself is unusable. That is NOT "the item is gone": it would look identical if
    // PLAID_ENV were misconfigured for every user, so treating it as success could orphan real
    // bank connections at scale. It must fail closed.
    ["INVALID_INPUT", "INVALID_ACCESS_TOKEN"],
    ["RATE_LIMIT_EXCEEDED", "RATE_LIMIT_EXCEEDED"],
    ["API_ERROR", "INTERNAL_SERVER_ERROR"],
    ["API_ERROR", "PLANNED_MAINTENANCE"],
    ["INSTITUTION_ERROR", "INSTITUTION_DOWN"],
    ["ITEM_ERROR", "ITEM_LOGIN_REQUIRED"], // a live item that needs re-login is still a live item
    ["INVALID_REQUEST", "INVALID_API_KEYS"],
  ])("is false for %s / %s (must not be mistaken for 'already gone')", (type, code) => {
    expect(isPlaidItemAlreadyRemoved(plaidErr({ error_type: type, error_code: code }))).toBe(false);
  });

  it("is false for anything that is not a structured Plaid error (network failure, decrypt failure, junk)", () => {
    expect(isPlaidItemAlreadyRemoved(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))).toBe(false);
    expect(isPlaidItemAlreadyRemoved(new Error("Unsupported state or unable to authenticate data"))).toBe(false);
    expect(isPlaidItemAlreadyRemoved(null)).toBe(false);
    expect(isPlaidItemAlreadyRemoved(undefined)).toBe(false);
    expect(isPlaidItemAlreadyRemoved("ITEM_NOT_FOUND")).toBe(false); // a bare string is not a Plaid error
    expect(isPlaidItemAlreadyRemoved({})).toBe(false);
  });
});

describe("readPlaidError", () => {
  it("reads from the SDK's response.data", () => {
    expect(readPlaidError(plaidErr({ error_code: "X", error_type: "Y" }))).toEqual({ error_code: "X", error_type: "Y" });
  });
  it("reads a bare error object", () => {
    expect(readPlaidError({ error_code: "Z" })).toEqual({ error_code: "Z" });
  });
  it("returns null for a plain Error / non-object", () => {
    expect(readPlaidError(new Error("boom"))).toBeNull();
    expect(readPlaidError("nope")).toBeNull();
  });
});

describe("classifyPlaidError", () => {
  it.each([
    ["ITEM_LOGIN_REQUIRED", "login_required"],
    ["PENDING_EXPIRATION", "pending_expiration"],
    ["USER_PERMISSION_REVOKED", "revoked"],
  ])("%s → no retry, force status %s, no failure count", (code, status) => {
    expect(classifyPlaidError(plaidErr({ error_code: code, error_type: "ITEM_ERROR" }))).toEqual({
      retry: false,
      countFailure: false,
      status,
      errorCode: code,
    });
  });

  it("RATE_LIMIT_EXCEEDED → retry, no failure count, no status", () => {
    expect(classifyPlaidError(plaidErr({ error_type: "RATE_LIMIT_EXCEEDED", error_code: "RATE_LIMIT" }))).toMatchObject({
      retry: true,
      countFailure: false,
      status: null,
    });
  });

  it("INSTITUTION_ERROR → retry, transient", () => {
    expect(
      classifyPlaidError(plaidErr({ error_type: "INSTITUTION_ERROR", error_code: "INSTITUTION_DOWN" })),
    ).toMatchObject({ retry: true, countFailure: false, status: null });
  });

  it("INVALID_REQUEST → no retry, count, force error (our bug)", () => {
    expect(classifyPlaidError(plaidErr({ error_type: "INVALID_REQUEST", error_code: "INVALID_FIELD" }))).toMatchObject({
      retry: false,
      countFailure: true,
      status: "error",
    });
  });

  it("API_ERROR / unknown → retry + count toward the threshold", () => {
    expect(classifyPlaidError(plaidErr({ error_type: "API_ERROR", error_code: "INTERNAL_SERVER_ERROR" }))).toMatchObject({
      retry: true,
      countFailure: true,
      status: null,
    });
    expect(classifyPlaidError(new Error("socket hang up"))).toMatchObject({ retry: true, countFailure: true });
  });

  it("a SyncMutationDuringPagination is recognized by readPlaidError, not swallowed as a bare Error", () => {
    // Regression guard for the bug this fix closes: before, this class had
    // no error_code, so readPlaidError returned null for it just like any
    // plain Error — see the "returns null for a plain Error" case above.
    expect(readPlaidError(new SyncMutationDuringPagination())).toMatchObject({
      error_code: MUTATION_DURING_PAGINATION_CODE,
      error_type: "TRANSACTIONS_ERROR",
    });
  });

  it("exhausted mutation-during-pagination → retryable + counted, real errorCode (not UNKNOWN)", () => {
    const decision = classifyPlaidError(new SyncMutationDuringPagination());
    expect(decision).toEqual({
      retry: true,
      countFailure: true,
      status: null,
      errorCode: MUTATION_DURING_PAGINATION_CODE,
    });
    expect(decision.errorCode).not.toBe("UNKNOWN");
  });
});

describe("describeSyncError", () => {
  it("extracts message and stack from a real Error", () => {
    const e = new Error("socket hang up");
    const result = describeSyncError(e);
    expect(result.message).toBe("socket hang up");
    expect(result.stack).toBe(e.stack);
  });

  it("extracts message and stack from a Plaid SDK (Axios-style) error without exposing response.data", () => {
    const e = Object.assign(new Error("Request failed with status code 400"), {
      response: { data: { error_code: "INVALID_FIELD", error_type: "INVALID_REQUEST", account_id: "secret-acct" } },
    });
    const result = describeSyncError(e);
    expect(result.message).toBe("Request failed with status code 400");
    expect(result).not.toHaveProperty("response");
    expect(JSON.stringify(result)).not.toContain("secret-acct");
  });

  it("omits stack when a real Error somehow has none", () => {
    const e = new Error("boom");
    e.stack = undefined;
    expect(describeSyncError(e)).toEqual({ message: "boom" });
  });

  it("never dumps a non-Error thrown value verbatim", () => {
    expect(describeSyncError({ access_token: "secret-token", foo: "bar" })).toEqual({
      message: "non-Error value thrown",
    });
    expect(describeSyncError("plain string throw")).toEqual({ message: "non-Error value thrown" });
    expect(describeSyncError(undefined)).toEqual({ message: "non-Error value thrown" });
  });
});

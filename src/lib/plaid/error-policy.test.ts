import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { classifyPlaidError, describePlaidError, isPlaidItemAlreadyRemoved, readPlaidError } from "./error-policy";
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

describe("describePlaidError", () => {
  it("extracts message and stack from a real Error", () => {
    const e = new Error("socket hang up");
    const result = describePlaidError(e);
    expect(result.message).toBe("socket hang up");
    expect(result.stack).toBe(e.stack);
  });

  it("extracts message and stack from a Plaid SDK (Axios-style) error without exposing response.data", () => {
    const e = Object.assign(new Error("Request failed with status code 400"), {
      response: { data: { error_code: "INVALID_FIELD", error_type: "INVALID_REQUEST", account_id: "secret-acct" } },
    });
    const result = describePlaidError(e);
    expect(result.message).toBe("Request failed with status code 400");
    expect(result).not.toHaveProperty("response");
    expect(JSON.stringify(result)).not.toContain("secret-acct");
  });

  it("omits stack when a real Error somehow has none", () => {
    const e = new Error("boom");
    e.stack = undefined;
    expect(describePlaidError(e)).toEqual({ message: "boom" });
  });

  it("never dumps a non-Error thrown value verbatim", () => {
    expect(describePlaidError({ access_token: "secret-token", foo: "bar" })).toEqual({
      message: "non-Error value thrown",
    });
    expect(describePlaidError("plain string throw")).toEqual({ message: "non-Error value thrown" });
    expect(describePlaidError(undefined)).toEqual({ message: "non-Error value thrown" });
  });
});

describe("describePlaidError never leaks the request", () => {
  // The shape a Plaid SDK (axios) error really has: the whole request rides
  // along, with the credentials in its headers and the token in its body.
  const plaidSdkError = () =>
    Object.assign(new Error("Request failed with status code 400"), {
      config: {
        headers: { "PLAID-CLIENT-ID": "client-id-LEAK", "PLAID-SECRET": "plaid-secret-LEAK" },
        data: JSON.stringify({ access_token: "access-production-LEAK" }),
      },
      request: { _header: "POST /transactions/refresh\r\nPLAID-SECRET: plaid-secret-LEAK" },
      response: {
        status: 400,
        data: {
          error_code: "ITEM_LOGIN_REQUIRED",
          error_type: "ITEM_ERROR",
          request_id: "req-42",
          display_message: "account ending 1234",
        },
      },
    });

  it("keeps only the message, stack and Plaid's own error fields", () => {
    const e = plaidSdkError();
    expect(describePlaidError(e)).toEqual({
      message: "Request failed with status code 400",
      stack: e.stack,
      errorCode: "ITEM_LOGIN_REQUIRED",
      errorType: "ITEM_ERROR",
      requestId: "req-42",
    });
  });

  it("puts no credential, token or account detail in the logged output", () => {
    const logged = JSON.stringify(describePlaidError(plaidSdkError()));
    expect(logged).not.toMatch(/LEAK/);
    expect(logged).not.toContain("account ending 1234");
  });
});

describe("describePlaidError never logs database row data", () => {
  // postgres.js puts Postgres's error on the cause; its message can quote input.
  const postgresError = () =>
    Object.assign(new Error('invalid input syntax for type uuid: "SYNTH_INPUT"'), {
      name: "PostgresError",
      severity: "ERROR",
      code: "22P02",
      table_name: "transactions",
      constraint_name: "transactions_pkey",
      detail: "Key (id)=(SYNTH_DETAIL) already exists.",
    });

  it("drops a Drizzle query error's SQL and parameters, keeping only stable identifiers", () => {
    const e = new DrizzleQueryError(
      'insert into "transactions" ("merchant_name", "amount") values ($1, $2)',
      ["SYNTH_MERCHANT", 4299],
      postgresError(),
    );
    const result = describePlaidError(e);
    expect(result).toMatchObject({
      message: "database query failed",
      dbCode: "22P02",
      dbTable: "transactions",
      dbConstraint: "transactions_pkey",
    });
    expect(result.stack).toMatch(/^\s+at /); // frames kept for debugging
    const logged = JSON.stringify(result);
    for (const leak of ["SYNTH_MERCHANT", "4299", "SYNTH_INPUT", "SYNTH_DETAIL", "Failed query", "merchant_name"]) {
      expect(logged, leak).not.toContain(leak);
    }
  });

  it("drops a raw postgres.js error's message, which can quote input", () => {
    const logged = describePlaidError(postgresError());
    expect(logged).toMatchObject({ message: "database query failed", dbCode: "22P02" });
    expect(JSON.stringify(logged)).not.toMatch(/SYNTH_/);
  });

  it("drops a supabase-js PostgrestError's message and details", () => {
    const e = Object.assign(new Error('duplicate key value violates unique constraint "x" (SYNTH_ROW)'), {
      name: "PostgrestError",
      code: "23505",
      details: "Key (item_id)=(SYNTH_ROW) already exists.",
      hint: null,
    });
    const logged = describePlaidError(e);
    expect(logged).toMatchObject({ message: "database query failed", dbCode: "23505" });
    expect(JSON.stringify(logged)).not.toContain("SYNTH_ROW");
  });

  it("keeps the code of a query that never reached Postgres", () => {
    const e = new DrizzleQueryError("select 1", [], Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(describePlaidError(e)).toMatchObject({ message: "database query failed", dbCode: "ECONNREFUSED" });
  });
});

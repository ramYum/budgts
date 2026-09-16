import { describe, expect, it } from "vitest";
import { classifyPlaidError, describeSyncError, readPlaidError } from "./error-policy";

const plaidErr = (data: object) => ({ response: { data } });

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

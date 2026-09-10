import { describe, expect, it } from "vitest";
import { classifyPlaidError, readPlaidError } from "./error-policy";

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

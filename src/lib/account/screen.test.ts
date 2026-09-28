import { describe, expect, it } from "vitest";
import { confirmWordMatches, deletedDestination, outcomeFromResponse } from "./screen";

describe("outcomeFromResponse: every answer of POST /api/account/delete has one state", () => {
  it.each([
    [200, { ok: true, alreadyDeleted: false, path: "hard-delete" }, { kind: "deleted", storeSubscriptionMayBeActive: false }],
    [200, { ok: true, alreadyDeleted: true, path: "already-deleted" }, { kind: "deleted", storeSubscriptionMayBeActive: false }],
    [
      200,
      { ok: true, alreadyDeleted: false, path: "anonymize", storeSubscriptionMayBeActive: true, manageSubscriptionLinks: [] },
      { kind: "deleted", storeSubscriptionMayBeActive: true },
    ],
    [401, { error: "unauthorized" }, { kind: "signed_out" }],
    [403, { error: "reauth_required" }, { kind: "reauth" }],
    [503, { error: "account_deletion_unavailable" }, { kind: "unavailable" }],
    [500, { error: "account_deletion_incomplete", retryable: true }, { kind: "incomplete" }],
    [502, { error: "plaid_removal_failed", retryable: true }, { kind: "plaid" }],
    [500, { error: "could not delete account" }, { kind: "failed" }],
    [500, null, { kind: "uncertain" }],
    [504, null, { kind: "uncertain" }],
    [502, "<html>Bad gateway</html>", { kind: "uncertain" }],
    [500, { error: "something new" }, { kind: "uncertain" }],
    [404, "<html>", { kind: "uncertain" }],
  ])("%i %j", (status, body, expected) => {
    expect(outcomeFromResponse(status, body)).toEqual(expected);
  });

  it("never reads a 2xx without ok:true as deleted, nor as not deleted", () => {
    expect(outcomeFromResponse(200, {}).kind).toBe("uncertain");
    expect(outcomeFromResponse(200, null).kind).toBe("uncertain");
  });

  it("says 'wasn't deleted' only for the route's own answer", () => {
    expect(outcomeFromResponse(500, { error: "could not delete account" }).kind).toBe("failed");
    expect(outcomeFromResponse(403, { error: "forbidden" }).kind).toBe("uncertain");
  });
});

describe("confirmWordMatches", () => {
  it("accepts DELETE in any case, with stray spaces", () => {
    expect(confirmWordMatches("DELETE")).toBe(true);
    expect(confirmWordMatches(" delete ")).toBe(true);
  });
  it("refuses anything else", () => {
    for (const typed of ["", "DELET", "DELETE ME", "delete!"]) expect(confirmWordMatches(typed)).toBe(false);
  });
});

describe("deletedDestination", () => {
  it("lands on the confirmation, flagged when a store subscription may still run", () => {
    expect(deletedDestination(false)).toBe("/account-deleted");
    expect(deletedDestination(true)).toBe("/account-deleted?store=1");
  });
});

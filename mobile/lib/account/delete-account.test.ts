import { describe, expect, it } from "vitest";
import { NotAuthenticatedError } from "../auth/api";
import { requestAccountDeletion } from "./delete-account";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("requestAccountDeletion", () => {
  it("reports a deletion with no store subscription to worry about", async () => {
    expect(await requestAccountDeletion(async () => json(200, { ok: true, alreadyDeleted: false, path: "A" }))).toEqual({
      status: "deleted",
      storeSubscriptionMayBeActive: false,
      manageSubscriptionUrl: null,
    });
  });

  it("carries the store-subscription warning and link when the server says one may still be running", async () => {
    const r = await requestAccountDeletion(async () =>
      json(200, {
        ok: true,
        alreadyDeleted: false,
        path: "B",
        storeSubscriptionMayBeActive: true,
        manageSubscriptionUrl: "https://budgts.example/manage-subscription",
      }),
    );
    expect(r).toEqual({
      status: "deleted",
      storeSubscriptionMayBeActive: true,
      manageSubscriptionUrl: "https://budgts.example/manage-subscription",
    });
  });

  it("asks for a fresh sign-in on reauth_required (403)", async () => {
    expect(await requestAccountDeletion(async () => json(403, { error: "reauth_required" }))).toEqual({ status: "reauth_required" });
  });

  it("distinguishes 'temporarily unavailable' from 'started but incomplete — try again'", async () => {
    expect(await requestAccountDeletion(async () => json(503, { error: "account_deletion_unavailable" }))).toEqual({ status: "unavailable" });
    expect(await requestAccountDeletion(async () => json(500, { error: "account_deletion_incomplete", retryable: true }))).toEqual({
      status: "incomplete",
    });
  });

  it("maps any other failure to a generic failed state, a lost session to auth, and no network to network", async () => {
    expect(await requestAccountDeletion(async () => json(500, { error: "could not delete account" }))).toEqual({ status: "failed" });
    expect(await requestAccountDeletion(async () => json(401, { error: "unauthorized" }))).toEqual({ status: "auth" });
    expect(
      await requestAccountDeletion(async () => {
        throw new NotAuthenticatedError();
      }),
    ).toEqual({ status: "auth" });
    expect(
      await requestAccountDeletion(async () => {
        throw new Error("offline");
      }),
    ).toEqual({ status: "network" });
  });
});

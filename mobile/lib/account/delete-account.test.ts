import { describe, expect, it } from "vitest";
import { NotAuthenticatedError } from "../auth/api";
import { requestAccountDeletion } from "./delete-account";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("requestAccountDeletion", () => {
  it("reports a deletion with no store subscription to worry about", async () => {
    expect(await requestAccountDeletion("apple", async () => json(200, { ok: true, alreadyDeleted: false, path: "A" }))).toEqual({
      status: "deleted",
      storeSubscriptionMayBeActive: false,
      manageSubscriptionUrl: null,
    });
  });

  it("carries the store-subscription warning and link when the server says one may still be running", async () => {
    const r = await requestAccountDeletion("apple", async () =>
      json(200, {
        ok: true,
        alreadyDeleted: false,
        path: "B",
        storeSubscriptionMayBeActive: true,
        manageSubscriptionLinks: [
          { store: "apple", label: "Manage in the App Store", url: "https://apps.apple.com/account/subscriptions" },
          { store: "google", label: "Manage in Google Play", url: "https://play.google.com/store/account/subscriptions?package=com.budgts.app" },
        ],
      }),
    );
    expect(r).toEqual({
      status: "deleted",
      storeSubscriptionMayBeActive: true,
      manageSubscriptionUrl: "https://apps.apple.com/account/subscriptions",
    });
  });

  it("asks for a fresh sign-in on reauth_required (403)", async () => {
    expect(await requestAccountDeletion("apple", async () => json(403, { error: "reauth_required" }))).toEqual({ status: "reauth_required" });
  });

  it("distinguishes 'temporarily unavailable' from 'started but incomplete — try again'", async () => {
    expect(await requestAccountDeletion("apple", async () => json(503, { error: "account_deletion_unavailable" }))).toEqual({ status: "unavailable" });
    expect(await requestAccountDeletion("apple", async () => json(500, { error: "account_deletion_incomplete", retryable: true }))).toEqual({
      status: "incomplete",
    });
  });

  it("names a bank Plaid won't remove (502 plaid_removal_failed), so the screen can send the user to Connected Banks", async () => {
    expect(await requestAccountDeletion("apple", async () => json(502, { error: "plaid_removal_failed", retryable: true }))).toEqual({
      status: "plaid",
    });
  });

  it("never says 'not deleted' for an answer it can't read: a gateway timeout, an HTML page, an unknown code or body", async () => {
    const html = (status: number) => new Response("<html>Gateway Timeout</html>", { status, headers: { "content-type": "text/html" } });
    expect(await requestAccountDeletion("apple", async () => html(504))).toEqual({ status: "uncertain" });
    expect(await requestAccountDeletion("apple", async () => html(502))).toEqual({ status: "uncertain" });
    expect(await requestAccountDeletion("apple", async () => json(500, { error: "something new" }))).toEqual({ status: "uncertain" });
    expect(await requestAccountDeletion("apple", async () => json(200, { unexpected: true }))).toEqual({ status: "uncertain" });
  });

  it("maps the route's own failure to failed, a lost session to auth, and no network to network", async () => {
    expect(await requestAccountDeletion("apple", async () => json(500, { error: "could not delete account" }))).toEqual({ status: "failed" });
    expect(await requestAccountDeletion("apple", async () => json(401, { error: "unauthorized" }))).toEqual({ status: "auth" });
    expect(
      await requestAccountDeletion("apple", async () => {
        throw new NotAuthenticatedError();
      }),
    ).toEqual({ status: "auth" });
    expect(
      await requestAccountDeletion("apple", async () => {
        throw new Error("offline");
      }),
    ).toEqual({ status: "network" });
  });
});

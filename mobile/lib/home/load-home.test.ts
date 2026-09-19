import { describe, expect, it } from "vitest";
import { NotAuthenticatedError } from "../auth/api";
import { loadHome } from "./load-home";

const valid = {
  version: 1,
  month: "2026-09",
  currency: "USD",
  moneyLeft: 100,
  income: 200,
  spent: 100,
  budgeted: 0,
  leftToSpend: 0,
  savingsRate: 0.5,
  categories: [],
  recent: [],
  savings: null,
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("loadHome", () => {
  it("success: returns the validated home", async () => {
    const state = await loadHome(async () => json(200, valid));
    expect(state).toEqual({ status: "ready", home: valid });
  });

  it("401: an expired/invalid session is an auth error (the user must sign in again)", async () => {
    const state = await loadHome(async () => json(401, { error: "unauthorized" }));
    expect(state).toMatchObject({ status: "error", kind: "auth" });
  });

  it("no session at all (authFetch throws NotAuthenticatedError) is also an auth error", async () => {
    const state = await loadHome(async () => {
      throw new NotAuthenticatedError();
    });
    expect(state).toMatchObject({ status: "error", kind: "auth" });
  });

  it("503: the server could not build the numbers — retryable, and no numbers shown", async () => {
    const state = await loadHome(async () => json(503, { error: "home_unavailable" }));
    expect(state).toMatchObject({ status: "error", kind: "unavailable" });
    expect(state).not.toHaveProperty("home");
  });

  it("any other non-OK status is 'unavailable'", async () => {
    expect(await loadHome(async () => json(500, {}))).toMatchObject({ status: "error", kind: "unavailable" });
  });

  it("network failure is its own retryable state", async () => {
    const state = await loadHome(async () => {
      throw new TypeError("Network request failed");
    });
    expect(state).toMatchObject({ status: "error", kind: "network" });
  });

  it("an unreadable or unrecognised body is a contract error, never a blank screen", async () => {
    expect(await loadHome(async () => new Response("<html>", { status: 200 }))).toMatchObject({
      status: "error",
      kind: "contract",
    });
    expect(await loadHome(async () => json(200, { ...valid, version: 99 }))).toMatchObject({
      status: "error",
      kind: "contract",
    });
  });

  it("error messages are human text and never echo the raw error", async () => {
    const state = await loadHome(async () => {
      throw new TypeError("secret-host.internal refused");
    });
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.message).not.toContain("secret-host");
  });
});

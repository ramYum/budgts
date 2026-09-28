import { describe, expect, it } from "vitest";
import { NotAuthenticatedError } from "../auth/api";
import { loadResource, mutate } from "./load";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const parseCount = (b: unknown) => (b as { n: number }).n;

describe("loadResource", () => {
  it("is ready with the parsed data", async () => {
    expect(await loadResource(async () => json(200, { n: 3 }), parseCount)).toEqual({ status: "ready", data: 3 });
  });

  it("maps each failure to a kind and a plain message (never raw error text)", async () => {
    const auth = await loadResource(async () => {
      throw new NotAuthenticatedError();
    }, parseCount);
    expect(auth).toMatchObject({ status: "error", kind: "auth" });

    const net = await loadResource(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.internal");
    }, parseCount);
    expect(net).toMatchObject({ status: "error", kind: "network" });
    expect(JSON.stringify(net)).not.toContain("ENOTFOUND");

    expect(await loadResource(async () => json(503, { error: "unavailable" }), parseCount)).toMatchObject({ kind: "unavailable" });
    expect(await loadResource(async () => json(200, { junk: 1 }), () => {
      throw new Error("shape");
    })).toMatchObject({ kind: "contract" });
    expect(await loadResource(async () => json(422, { error: "invalid_month" }), parseCount)).toMatchObject({ kind: "rejected" });
  });
});

describe("mutate", () => {
  it("is ok, carrying the id a create returns", async () => {
    expect(await mutate(async () => json(201, { id: "new-1" }))).toEqual({ status: "ok", id: "new-1" });
    expect(await mutate(async () => json(200, { ok: true }))).toEqual({ status: "ok" });
  });

  it("maps validation, conflict, missing and nothing_to_copy to their own outcomes", async () => {
    expect(await mutate(async () => json(422, { error: "invalid", fieldErrors: { amount: "Enter a valid amount" } }))).toEqual({
      status: "invalid",
      fieldErrors: { amount: "Enter a valid amount" },
    });
    expect(await mutate(async () => json(409, { error: "conflict" }))).toEqual({ status: "conflict" });
    expect(await mutate(async () => json(404, { error: "not_found" }))).toEqual({ status: "missing" });
    expect(await mutate(async () => json(409, { error: "nothing_to_copy" }))).toEqual({ status: "nothing_to_copy" });
  });

  it("reports auth, network and server failures with a message and no raw text", async () => {
    expect(await mutate(async () => json(401, { error: "unauthorized" }))).toMatchObject({ status: "error", kind: "auth" });
    expect(
      await mutate(async () => {
        throw new Error("offline");
      }),
    ).toMatchObject({ status: "error", kind: "network" });
    const server = await mutate(async () => json(503, { error: "unavailable" }));
    expect(server).toMatchObject({ status: "error", kind: "unavailable" });
    expect((server as { message: string }).message).toMatch(/try again/i);
  });

  it("treats an unexpected 4xx as a generic error rather than a validation problem", async () => {
    expect(await mutate(async () => json(400, { error: "invalid_body" }))).toMatchObject({ status: "error", kind: "unavailable" });
  });
});

import { describe, expect, it } from "vitest";
import { NotAuthenticatedError } from "../auth/api";
import { apiRequest, jsonInit } from "./request";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const parseOk = (b: unknown) => (b as { ok: boolean }).ok;

describe("apiRequest", () => {
  it("returns the parsed body on success", async () => {
    expect(await apiRequest(async () => json(200, { ok: true }), parseOk)).toEqual({ ok: true, data: true });
  });

  it("maps a missing session to auth without any network call", async () => {
    const r = await apiRequest(async () => {
      throw new NotAuthenticatedError();
    }, parseOk);
    expect(r).toEqual({ ok: false, kind: "auth" });
  });

  it("maps a 401 to auth", async () => {
    expect(await apiRequest(async () => json(401, { error: "unauthorized" }), parseOk)).toMatchObject({ ok: false, kind: "auth" });
  });

  it("maps a thrown fetch to network, never leaking the error text", async () => {
    const r = await apiRequest(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.internal.example");
    }, parseOk);
    expect(r).toEqual({ ok: false, kind: "network" });
  });

  it("maps a 5xx to unavailable and keeps the stable error code", async () => {
    const r = await apiRequest(async () => json(503, { error: "unavailable" }), parseOk);
    expect(r).toEqual({ ok: false, kind: "unavailable", status: 503, code: "unavailable" });
  });

  it("maps a 4xx to rejected with the code and field errors", async () => {
    const r = await apiRequest(async () => json(422, { error: "invalid_currency", fieldErrors: { currency: "Pick one" } }), parseOk);
    expect(r).toEqual({ ok: false, kind: "rejected", status: 422, code: "invalid_currency", fieldErrors: { currency: "Pick one" } });
  });

  it("tolerates an error body that is not JSON", async () => {
    const r = await apiRequest(async () => new Response("<html>bad gateway</html>", { status: 502 }), parseOk);
    expect(r).toEqual({ ok: false, kind: "unavailable", status: 502 });
  });

  it("reports a contract failure when a success body does not parse", async () => {
    const r = await apiRequest(
      async () => json(200, { nope: 1 }),
      () => {
        throw new Error("shape");
      },
    );
    expect(r).toEqual({ ok: false, kind: "contract" });
  });
});

describe("jsonInit", () => {
  it("builds a JSON request body", () => {
    const init = jsonInit("POST", { currency: "EUR" });
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe('{"currency":"EUR"}');
  });
});

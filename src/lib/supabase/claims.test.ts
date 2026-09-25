import { describe, expect, it } from "vitest";
import { sessionUserFromClaims } from "./claims";

const auth = (getClaims: () => Promise<unknown>) => ({ getClaims }) as never;

describe("sessionUserFromClaims", () => {
  it("returns id and email from verified claims", async () => {
    const user = await sessionUserFromClaims(
      auth(async () => ({ data: { claims: { sub: "u1", email: "a@b.co" } }, error: null })),
    );
    expect(user).toEqual({ id: "u1", email: "a@b.co" });
  });

  it("is null when there is no session or the token fails verification", async () => {
    expect(await sessionUserFromClaims(auth(async () => ({ data: null, error: null })))).toBeNull();
    expect(
      await sessionUserFromClaims(auth(async () => ({ data: null, error: new Error("Invalid JWT signature") }))),
    ).toBeNull();
    expect(await sessionUserFromClaims(auth(async () => ({ data: { claims: {} }, error: null })))).toBeNull();
  });

  // auth-js decodes the cookie's JWT with JSON.parse and lets a SyntaxError
  // escape getClaims() for a malformed token — that must read as "signed out"
  // (redirect to /sign-in), not a 500 on every page until cookies are cleared.
  it("is null when getClaims throws on a malformed token", async () => {
    expect(
      await sessionUserFromClaims(
        auth(async () => {
          throw new SyntaxError("Unexpected token");
        }),
      ),
    ).toBeNull();
  });
});

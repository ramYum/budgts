import { describe, expect, it } from "vitest";
import { newRequestId } from "./request-id";

describe("newRequestId", () => {
  it("is a v4 UUID from the platform's crypto: every create command accepts it (goals require a UUID)", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/); // transactions' format too
    expect(b).not.toBe(a);
  });
});

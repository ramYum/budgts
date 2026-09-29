import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getBearerContext = vi.fn();
const getPrivilegedUser = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/server/privileged-user", () => ({ getPrivilegedUser: (...a: unknown[]) => getPrivilegedUser(...a) }));
vi.mock("@/lib/legal/config", () => ({
  legalFacts: () => ({ contactEmail: "support@example.test", retentionYears: 0 }),
  keepsRecordsAfterDeletion: (f: { retentionYears: number } | null) => f === null || f.retentionYears > 0,
}));
vi.mock("@/lib/billing/config", () => ({ billingLive: () => false }));

import { GET } from "./route";

const req = () => new Request("https://example.test/api/mobile/account/delete", { headers: { authorization: "Bearer t" } });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

beforeEach(() => {
  getBearerContext.mockReset();
  getPrivilegedUser.mockReset();
  rpc.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase: { rpc } });
  rpc.mockResolvedValue({ data: true, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/account/delete", () => {
  it("gives the screen's first state from the network-checked user", async () => {
    getPrivilegedUser.mockResolvedValue({
      id: "user-a",
      email: "a@example.test",
      last_sign_in_at: minutesAgo(2),
      app_metadata: { providers: ["email", "google"] },
    });
    expect(await (await GET(req())).json()).toEqual({
      version: 1,
      email: "a@example.test",
      recent: true,
      google: true,
      inProgress: false,
      supportEmail: "support@example.test",
      billing: false,
      keepsRecords: false,
    });
    expect(rpc).toHaveBeenCalledWith("account_accepts_writes");
  });

  it("an old sign-in needs a fresh one; a started deletion says so", async () => {
    getPrivilegedUser.mockResolvedValue({ id: "user-a", email: "a@x.test", last_sign_in_at: minutesAgo(60), app_metadata: { provider: "email" } });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await (await GET(req())).json()).toMatchObject({ recent: false, google: false, inProgress: true });
  });

  it("refuses a revoked session, or one whose network user is not the token's", async () => {
    getPrivilegedUser.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    getPrivilegedUser.mockResolvedValue({ id: "someone-else", app_metadata: {} });
    expect((await GET(req())).status).toBe(401);
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });
});

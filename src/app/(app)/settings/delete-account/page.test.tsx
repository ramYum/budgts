import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getPrivilegedCookieUser = vi.fn();
vi.mock("@/server/privileged-user", () => ({ getPrivilegedCookieUser: () => getPrivilegedCookieUser() }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
const flowProps = vi.fn();
vi.mock("@/components/account/delete-account-flow", () => ({
  DeleteAccountFlow: (props: unknown) => {
    flowProps(props);
    return null;
  },
}));
vi.mock("@/components/standalone-shell", () => ({ StandaloneShell: ({ children }: { children: React.ReactNode }) => children }));

import DeleteAccountPage from "./page";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const page = async (step?: string) =>
  render(await DeleteAccountPage({ params: Promise.resolve({}), searchParams: Promise.resolve(step ? { step } : {}) }));

beforeEach(() => {
  flowProps.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("DeleteAccountPage picks the first state from Supabase Auth", () => {
  it("a recent magic-link sign-in: the explanation first, no Google, not in progress", async () => {
    getPrivilegedCookieUser.mockResolvedValue({ email: "a@x.test", last_sign_in_at: minutesAgo(2), app_metadata: { provider: "email", providers: ["email"] } });
    await page();
    expect(flowProps).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@x.test", recent: true, google: false, inProgress: false, initial: "intro" }),
    );
  });

  it("an old Google sign-in returning to the confirm step: not recent, Google offered", async () => {
    getPrivilegedCookieUser.mockResolvedValue({ email: "a@x.test", last_sign_in_at: minutesAgo(30), app_metadata: { providers: ["email", "google"] } });
    await page("confirm");
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ recent: false, google: true, initial: "confirm" }));
  });

  it("a deletion that already took the lock", async () => {
    getPrivilegedCookieUser.mockResolvedValue({ email: "a@x.test", last_sign_in_at: minutesAgo(2), app_metadata: {} });
    rpc.mockResolvedValue({ data: false, error: null });
    await page();
    expect(rpc).toHaveBeenCalledWith("account_accepts_writes");
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ inProgress: true }));
  });

  it("a session Auth no longer accepts opens signed out", async () => {
    getPrivilegedCookieUser.mockResolvedValue(null);
    await page();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ initial: "signed_out" }));
    expect(rpc).not.toHaveBeenCalled();
  });
});

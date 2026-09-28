import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { DeletionBanner } from "./deletion-banner";

describe("DeletionBanner", () => {
  it("says the account is read-only while a deletion holds the lock, with the way to finish it", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    render((await DeletionBanner())!);
    expect(rpc).toHaveBeenCalledWith("account_accepts_writes");
    expect(screen.getByRole("status")).toHaveTextContent(/Your account is being deleted\. It's read-only, so changes won't save/);
    expect(screen.getByRole("link", { name: "Finish deleting" })).toHaveAttribute("href", "/settings/delete-account");
  });

  it("shows nothing for an account that accepts writes, or when the check itself fails", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await DeletionBanner()).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect(await DeletionBanner()).toBeNull();
  });
});

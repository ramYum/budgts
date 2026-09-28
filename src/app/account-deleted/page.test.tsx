import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FULL_LEGAL_ENV } from "@/test-utils/legal-env";
import AccountDeletedPage from "./page";

const page = async (store?: string) =>
  render(await AccountDeletedPage({ params: Promise.resolve({}), searchParams: Promise.resolve(store ? { store } : {}) }));

afterEach(() => vi.unstubAllEnvs());

describe("AccountDeletedPage", () => {
  it("confirms the deletion and offers one way on", async () => {
    await page();
    expect(screen.getByRole("heading", { name: "Your account is deleted" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByText(/does not automatically cancel/)).not.toBeInTheDocument();
  });

  it("warns that a store subscription was not cancelled when the deletion said one may be running", async () => {
    await page("1");
    expect(screen.getByRole("status")).toHaveTextContent(/does not automatically cancel/);
    expect(screen.getByRole("link", { name: "App Store" })).toHaveAttribute("href", "https://apps.apple.com/account/subscriptions");
  });

  it("links the privacy policy's retention section only while the legal pages are live", async () => {
    for (const name of Object.keys(FULL_LEGAL_ENV)) vi.stubEnv(name, "");
    const off = await page();
    expect(screen.queryByRole("link", { name: /What we keep and why/ })).not.toBeInTheDocument();
    off.unmount();
    for (const [name, value] of Object.entries(FULL_LEGAL_ENV)) vi.stubEnv(name, value);
    await page();
    expect(screen.getByRole("link", { name: /What we keep and why/ })).toHaveAttribute("href", "/privacy#deleting-your-data");
  });
});

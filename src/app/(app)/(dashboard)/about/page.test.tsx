import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FULL_LEGAL_ENV } from "@/test-utils/legal-env";
import AboutPage from "./page";

afterEach(() => vi.unstubAllEnvs());

describe("AboutPage legal links", () => {
  it("has none while the legal pages are off", () => {
    for (const name of Object.keys(FULL_LEGAL_ENV)) vi.stubEnv(name, "");
    render(<AboutPage />);
    expect(screen.queryByText("Legal")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Privacy policy/ })).not.toBeInTheDocument();
  });

  it("links Privacy, Terms and Support once they are on", () => {
    for (const [name, value] of Object.entries(FULL_LEGAL_ENV)) vi.stubEnv(name, value);
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: /Privacy policy/ })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: /Terms of service/ })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /Support/ })).toHaveAttribute("href", "/support");
  });
});

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no matchMedia. Default to "reduced motion" so animations that
// check it (CountUp) render at their final value immediately — deterministic
// by default. A test exercising the animation itself can override this.
// Guarded: a test file that opts into the node environment (`// @vitest-environment node`, e.g. the embedded-Postgres
// tests) has no `window`.
if (typeof window !== "undefined") {
  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

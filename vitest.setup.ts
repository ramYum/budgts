import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no matchMedia. Default to "reduced motion" so motion code that
// checks it (Reveal) stays still — deterministic by default. A test
// exercising the motion itself can override this.
// Guarded: a test file that opts into the node environment
// (`// @vitest-environment node`, e.g. the embedded-Postgres tests) has no
// `window`.
if (typeof window !== "undefined") {
  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  // jsdom has no ResizeObserver either; the sunset backdrop (components/backdrop.tsx) watches its box with one. A
  // no-op stands in: jsdom lays nothing out, so there is never a resize to report.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

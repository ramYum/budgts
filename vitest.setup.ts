import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no matchMedia. Default to "reduced motion" so motion code that
// checks it (Reveal) stays still — deterministic by default. A test
// exercising the motion itself can override this.
window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

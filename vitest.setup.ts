import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no matchMedia. Default to "reduced motion" so animations that
// check it (CountUp) render at their final value immediately — deterministic
// by default. A test exercising the animation itself can override this.
window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

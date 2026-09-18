import { defineConfig } from "vitest/config";

// Only the pure-logic modules (no react-native/expo native imports) are
// unit-testable outside a device/emulator — see AGENTS.md in this directory
// and the mobile-auth milestone report for what still needs on-device
// verification (session persistence, deep-link handoff, OAuth browser flow).
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    globals: true,
  },
});

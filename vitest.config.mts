import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    // The React Testing Library component tests (jsdom, user-event) take seconds each once the whole suite runs in
    // parallel on one machine; the 5s default timed them out at random (transaction-list, account-mapping,
    // needs-category) though each passes alone. One budget for every test, set once here, not per test.
    testTimeout: 15_000,
  },
});

import { defineConfig } from "vitest/config";

// Pure logic (lib/**) runs as is. The brand components (components/**) render
// with react-test-renderer over host stand-ins for react-native and
// react-native-svg (test/native-hosts.ts): their structure, geometry, colours
// and accessibility props are checked here; how the OS draws them is checked
// on a device (mobile/README.md, "Brand primitives").
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "components/**/*.test.tsx", "test/**/*.test.ts"],
    globals: true,
    setupFiles: ["./test/native-mocks.setup.ts"],
    // Screen tests render whole sheets through the host stand-ins; under a loaded machine (a Gradle build alongside, the
    // full suite in parallel) they ran past the 5s default at random though each passes alone. One budget, set here.
    testTimeout: 15_000,
    // expo-linking ships untranspiled ESM; callback-url.test.ts runs its real
    // createURL against faked expo-constants to pin the redirect-URL shape.
    server: { deps: { inline: [/expo-linking/] } },
  },
});

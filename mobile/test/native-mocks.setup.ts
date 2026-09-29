import { vi } from "vitest";

// vi.mock is hoisted: the factories load the stand-ins themselves (native-hosts.ts).
vi.mock("react-native", async () => (await import("./native-hosts")).reactNativeMock());
vi.mock("react-native-svg", async () => (await import("./native-hosts")).svgMock());
vi.mock("react-native-reanimated", async () => (await import("./native-hosts")).reanimatedMock());
vi.mock("react-native-worklets", async () => (await import("./native-hosts")).workletsMock());

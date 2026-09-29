import { vi } from "vitest";

// vi.mock is hoisted: the factories load the stand-ins themselves (native-hosts.ts).
vi.mock("react-native", async () => (await import("./native-hosts")).reactNativeMock());
vi.mock("react-native-svg", async () => (await import("./native-hosts")).svgMock());

import { vi } from "vitest";

// vi.mock is hoisted: the factories load the stand-ins themselves (native-hosts.ts).
vi.mock("react-native", async () => (await import("./native-hosts")).reactNativeMock());
vi.mock("react-native-svg", async () => (await import("./native-hosts")).svgMock());
vi.mock("react-native-reanimated", async () => (await import("./native-hosts")).reanimatedMock());
vi.mock("react-native-worklets", async () => (await import("./native-hosts")).workletsMock());


// Safe-area insets: none by default (a test mocks the module itself to set them).
vi.mock("react-native-safe-area-context", async () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: (await import("./native-hosts")).reactNativeMock().View,
}));

// expo-blur: the header's backdrop blur, as plain hosts (the blur itself is the device's to draw).
vi.mock("expo-blur", async () => {
  const { reactNativeMock } = await import("./native-hosts");
  const { View } = reactNativeMock();
  return { BlurView: View, BlurTargetView: View };
});

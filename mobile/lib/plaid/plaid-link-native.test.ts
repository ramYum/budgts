import { beforeEach, describe, expect, it, vi } from "vitest";

type Config = {
  token: string;
  onSuccess: (s: { publicToken: string; metadata: { institution: { id: string; name: string } | null } }) => void;
  onExit: (e: unknown) => void;
  onEvent?: (e: unknown) => void;
};
const sdk = vi.hoisted(() => ({ config: null as Config | null, open: vi.fn(async () => {}) }));

vi.mock("react-native-plaid-link-sdk", () => ({
  sdkVersion: "13.0.0",
  createPlaidLinkSession: vi.fn(async (config: Config) => {
    sdk.config = config;
    return { open: sdk.open };
  }),
}));

import { createPlaidLinkClient } from "./plaid-link-native";

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("createPlaidLinkClient", () => {
  beforeEach(() => {
    sdk.config = null;
    sdk.open.mockClear();
  });

  it("keeps waiting through an error Link lets the user retry, and returns the bank they then connect", async () => {
    const outcome = createPlaidLinkClient().open("link-token");
    await settle();
    // a mistyped password: Link shows the error and stays open; a connection that then succeeds must not be dropped
    sdk.config!.onEvent?.({ eventName: "ERROR", metadata: { errorCode: "INVALID_CREDENTIALS" } });
    sdk.config!.onSuccess({ publicToken: "public-1", metadata: { institution: { id: "ins_1", name: "First Platypus Bank" } } });
    await expect(outcome).resolves.toEqual({ kind: "success", publicToken: "public-1", institution: { id: "ins_1", name: "First Platypus Bank" } });
  });

  it("ends on Link's exit", async () => {
    const outcome = createPlaidLinkClient().open("link-token");
    await settle();
    sdk.config!.onExit({ error: { errorCode: "INSTITUTION_NOT_RESPONDING" } });
    await expect(outcome).resolves.toEqual({ kind: "exit" });
  });

  it("rejects when Link cannot start", async () => {
    sdk.open.mockRejectedValueOnce(new Error("no activity"));
    await expect(createPlaidLinkClient().open("link-token")).rejects.toThrow("no activity");
  });
});
